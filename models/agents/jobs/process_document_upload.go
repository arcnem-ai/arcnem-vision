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
		return load.LoadDocumentAndAgentGraph(ctx, db, input.Event.Data.DocumentID)
	})
	if err != nil {
		return nil, inngestgo.NoRetryError(fmt.Errorf("Failed to load document and agent graph %v", err))
	}
	if result == nil {
		return nil, inngestgo.NoRetryError(fmt.Errorf("DocumentAndAgentGraph was nil %v", err))
	}
	if result.Document == nil {
		return nil, inngestgo.NoRetryError(fmt.Errorf("document payload was nil"))
	}
	if result.GraphSnapshot == nil || result.GraphSnapshot.AgentGraph == nil {
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
		return nil, inngestgo.NoRetryError(fmt.Errorf("Failed to produce temp url for document %v", err))
	}

	graphResult, err := step.Run(ctx, "run-graph", func(ctx context.Context) (map[string]any, error) {
		initialState := map[string]any{
			"document_id": result.Document.ID,
			"temp_url":    tempURL,
		}

		tracker, err := graphs.NewRunTracker(db, result.GraphSnapshot.AgentGraph.ID, initialState)
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
		return nil, inngestgo.NoRetryError(fmt.Errorf("Graph run failed %v", err))
	}

	return graphResult, nil
}
