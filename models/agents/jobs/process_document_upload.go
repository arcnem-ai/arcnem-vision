package jobs

import (
	"context"
	"fmt"
	"time"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	"github.com/arcnem-ai/arcnem-vision/models/agents/inputs"
	"github.com/arcnem-ai/arcnem-vision/models/agents/load"
	"github.com/inngest/inngestgo"
	"github.com/inngest/inngestgo/step"
	"github.com/smallnest/langgraphgo/graph"
)

func ProcessDocumentUpload(ctx context.Context, input inngestgo.Input[inputs.ProcessDocumentUploadInput]) (any, error) {
	db, ok := GetDBClient(ctx)
	if !ok {
		return nil, inngestgo.NoRetryError(fmt.Errorf("db not found in context"))
	}
	s3Client, ok := GetS3Client(ctx)
	if !ok {
		return nil, inngestgo.NoRetryError(fmt.Errorf("s3 not found in context"))
	}
	mcpClient, ok := GetMCPClient(ctx)
	if !ok {
		return nil, inngestgo.NoRetryError(fmt.Errorf("mcp not found in context"))
	}

	result, err := step.Run(ctx, "load-document-and-agent-graph", func(ctx context.Context) (*load.DocumentAndAgentGraph, error) {
		return load.LoadDocumentAndAgentGraph(
			ctx,
			db,
			input.Event.Data.DocumentID,
			input.Event.Data.AgentGraphID,
		)
	})
	if err != nil {
		return nil, inngestgo.NoRetryError(
			fmt.Errorf("failed to load document and agent graph: %w", err),
		)
	}
	if result == nil {
		return nil, inngestgo.NoRetryError(
			fmt.Errorf("document and agent graph payload was nil"),
		)
	}
	if result.Document == nil {
		return nil, inngestgo.NoRetryError(fmt.Errorf("document payload was nil"))
	}
	if result.GraphSnapshot == nil || result.GraphSnapshot.AgentGraph == nil {
		if input.Event.Data.AgentGraphID != nil {
			return nil, inngestgo.NoRetryError(
				fmt.Errorf(
					"document %s could not access requested workflow %s",
					input.Event.Data.DocumentID,
					input.Event.Data.AgentGraphID,
				),
			)
		}
		return nil, inngestgo.NoRetryError(
			fmt.Errorf("document %s has no workflow assigned", input.Event.Data.DocumentID),
		)
	}

	tempURL, err := step.Run(ctx, "get-doc-temp-link", func(ctx context.Context) (string, error) {
		return s3Client.PresignDownload(
			ctx,
			result.Document.Bucket,
			result.Document.ObjectKey,
			15*time.Minute,
		)
	})
	if err != nil {
		return nil, inngestgo.NoRetryError(
			fmt.Errorf("failed to produce temp url for document: %w", err),
		)
	}

	graphResult, err := step.Run(ctx, "run-graph", func(ctx context.Context) (map[string]any, error) {
		initialState := map[string]any{
			"document_id": result.Document.ID,
			"temp_url":    tempURL,
		}

		tracker, err := graphs.NewRunTracker(
			db,
			result.GraphSnapshot.AgentGraph.ID,
			result.GraphSnapshot.AgentGraph.OrganizationID,
			initialState,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create run tracker: %w", err)
		}

		builtGraph, err := graphs.BuildGraph(result.GraphSnapshot, mcpClient)
		if err != nil {
			return nil, fmt.Errorf("failed to build graph: %w", err)
		}
		if builtGraph == nil {
			return nil, fmt.Errorf("built graph is nil")
		}

		tracer := graph.NewTracer()
		tracer.AddHook(tracker)
		// Attach tracer directly to the compiled runnable so node-level events fire.
		builtGraph.SetTracer(tracer)
		return builtGraph.Invoke(ctx, initialState)
	})
	if err != nil {
		return nil, inngestgo.NoRetryError(
			fmt.Errorf("graph run failed: %w", err),
		)
	}

	return graphResult, nil
}
