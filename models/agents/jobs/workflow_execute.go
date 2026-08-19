package jobs

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	"github.com/arcnem-ai/arcnem-vision/models/agents/inputs"
	"github.com/arcnem-ai/arcnem-vision/models/agents/load"
	"github.com/inngest/inngestgo"
	"github.com/inngest/inngestgo/step"
	"github.com/smallnest/langgraphgo/graph"
)

type preparedWorkflowState struct {
	DocumentIDs []string         `json:"document_ids"`
	Documents   []map[string]any `json:"documents"`
}

func ExecuteWorkflow(ctx context.Context, input inngestgo.Input[inputs.ExecuteWorkflowInput]) (result any, runErr error) {
	db, ok := GetDBClient(ctx)
	if !ok {
		return nil, inngestgo.NoRetryError(fmt.Errorf("db not found in context"))
	}
	executionID := input.Event.Data.ExecutionID.String()
	organizationID := input.Event.Data.OrganizationID.String()
	finalizeFailure := func(runErr error) {
		_, err := graphs.FinalizeRun(db, executionID, organizationID, "failed", nil, runErr)
		if err != nil {
			log.Printf("workflow run finalization failed run_id=%s err=%v", executionID, err)
		}
	}
	defer func() {
		if runErr != nil {
			finalizeFailure(runErr)
		}
	}()
	s3Client, ok := GetS3Client(ctx)
	if !ok {
		return nil, inngestgo.NoRetryError(fmt.Errorf("s3 not found in context"))
	}
	mcpClient, ok := GetMCPClient(ctx)
	if !ok {
		return nil, inngestgo.NoRetryError(fmt.Errorf("mcp not found in context"))
	}

	payload, err := step.Run(ctx, "load-documents-and-agent-graph", func(ctx context.Context) (*load.WorkflowExecutionPayload, error) {
		payload, err := load.LoadWorkflowExecutionPayload(
			ctx,
			db,
			input.Event.Data.DocumentIDs,
			input.Event.Data.ExecutionID,
		)
		if err != nil {
			err = fmt.Errorf("failed to load workflow execution payload: %w", err)
			finalizeFailure(err)
			return nil, inngestgo.NoRetryError(err)
		}
		return payload, nil
	})
	if err != nil {
		return nil, err
	}
	if payload == nil {
		return nil, inngestgo.NoRetryError(fmt.Errorf("workflow execution payload was nil"))
	}
	if payload.GraphSnapshot == nil || payload.GraphSnapshot.AgentGraph == nil {
		return nil, inngestgo.NoRetryError(fmt.Errorf("workflow payload had no graph snapshot"))
	}
	organizationID = payload.GraphSnapshot.AgentGraph.OrganizationID
	if len(payload.Documents) == 0 {
		return nil, inngestgo.NoRetryError(fmt.Errorf("workflow execution payload had no documents"))
	}

	preparedState, err := step.Run(ctx, "prepare-runtime-state", func(ctx context.Context) (*preparedWorkflowState, error) {
		documentIDs := make([]string, 0, len(payload.Documents))
		documents := make([]map[string]any, 0, len(payload.Documents))

		for _, document := range payload.Documents {
			tempURL, err := s3Client.PresignDownload(
				ctx,
				document.Bucket,
				document.ObjectKey,
				15*time.Minute,
			)
			if err != nil {
				err = fmt.Errorf(
					"failed to produce temp url for document %s: %w",
					document.ID,
					err,
				)
				finalizeFailure(err)
				return nil, inngestgo.NoRetryError(err)
			}

			documentIDs = append(documentIDs, document.ID)
			documents = append(documents, map[string]any{
				"id":              document.ID,
				"bucket":          document.Bucket,
				"object_key":      document.ObjectKey,
				"content_type":    document.ContentType,
				"size_bytes":      document.SizeBytes,
				"visibility":      document.Visibility,
				"organization_id": document.OrganizationID,
				"project_id":      document.ProjectID,
				"api_key_id":      document.APIKeyID,
				"created_at":      document.CreatedAt.Format(time.RFC3339),
				"temp_url":        tempURL,
			})
		}

		return &preparedWorkflowState{
			DocumentIDs: documentIDs,
			Documents:   documents,
		}, nil
	})
	if err != nil {
		return nil, err
	}
	if preparedState == nil {
		return nil, inngestgo.NoRetryError(fmt.Errorf("prepared workflow state was nil"))
	}

	graphResult, err := step.Run(ctx, "run-graph", func(ctx context.Context) (graphState map[string]any, graphErr error) {
		defer func() {
			status := "failed"
			if graphErr == nil {
				status = "completed"
			}
			_, finalizeErr := graphs.FinalizeRun(
				db,
				executionID,
				organizationID,
				status,
				graphState,
				graphErr,
			)
			if finalizeErr != nil {
				if graphErr == nil {
					graphState = nil
					graphErr = fmt.Errorf("failed to finalize workflow run: %w", finalizeErr)
				} else {
					log.Printf("workflow run finalization failed run_id=%s err=%v", executionID, finalizeErr)
				}
			}
			if graphErr != nil {
				graphErr = inngestgo.NoRetryError(fmt.Errorf("graph run failed: %w", graphErr))
			}
		}()

		initialState := make(map[string]any, len(input.Event.Data.InitialState)+4)
		for key, value := range input.Event.Data.InitialState {
			initialState[key] = value
		}

		initialState["document_ids"] = preparedState.DocumentIDs
		initialState["documents"] = preparedState.Documents
		if input.Event.Data.Scope != nil {
			initialState["scope"] = input.Event.Data.Scope
		}
		if len(preparedState.Documents) == 1 {
			initialState["document_id"] = preparedState.DocumentIDs[0]
			initialState["temp_url"] = preparedState.Documents[0]["temp_url"]
		}

		projectID := payload.Documents[0].ProjectID
		for _, document := range payload.Documents[1:] {
			if document.ProjectID != projectID {
				return nil, fmt.Errorf(
					"workflow execution %s spans multiple projects",
					input.Event.Data.ExecutionID.String(),
				)
			}
		}

		tracker, err := graphs.NewRunTrackerWithOptions(
			db,
			payload.GraphSnapshot.AgentGraph.ID,
			payload.GraphSnapshot.AgentGraph.OrganizationID,
			initialState,
			graphs.RunTrackerOptions{
				RunID:     input.Event.Data.ExecutionID.String(),
				ProjectID: projectID,
			},
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create run tracker: %w", err)
		}

		builtGraph, err := graphs.BuildGraph(payload.GraphSnapshot, mcpClient)
		if err != nil {
			return nil, fmt.Errorf("failed to build graph: %w", err)
		}
		if builtGraph == nil {
			return nil, fmt.Errorf("built graph is nil")
		}

		tracer := graph.NewTracer()
		tracer.AddHook(tracker)
		builtGraph.SetTracer(tracer)
		return builtGraph.Invoke(clients.ContextWithExecutionID(ctx, tracker.RunID()), initialState)
	})
	if err != nil {
		return nil, err
	}

	return graphResult, nil
}
