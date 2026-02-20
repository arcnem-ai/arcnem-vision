package graphs

import (
	"encoding/json"
	"fmt"

	"github.com/smallnest/langgraphgo/graph"
	"github.com/smallnest/langgraphgo/prebuilt"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

// parseWorkerConfig extracts system_message and max_iterations from a node's config jsonb.
func parseWorkerConfig(snapshotNode *SnapshotNode) (int, []prebuilt.CreateAgentOption, error) {
	var nodeConfig struct {
		SystemMessage string `json:"system_message"`
		MaxIterations int    `json:"max_iterations"`
	}
	if err := json.Unmarshal([]byte(snapshotNode.Node.Config), &nodeConfig); err != nil {
		return 0, nil, fmt.Errorf("worker node %q: invalid config json: %w", snapshotNode.Node.NodeKey, err)
	}

	var opts []prebuilt.CreateAgentOption
	if nodeConfig.SystemMessage != "" {
		opts = append(opts, prebuilt.WithSystemMessage(nodeConfig.SystemMessage))
	}

	maxIterations := 10
	if nodeConfig.MaxIterations > 0 {
		maxIterations = nodeConfig.MaxIterations
	}

	return maxIterations, opts, nil
}

// buildAgentMap creates a ReAct agent StateRunnable via the prebuilt package.
func buildAgentMap(model llms.Model, graphTools []tools.Tool, maxIterations int, opts ...prebuilt.CreateAgentOption) (*graph.StateRunnable[map[string]any], error) {
	return prebuilt.CreateAgentMap(model, graphTools, maxIterations, opts...)
}

// extractLastAIMessage pulls the text from the last AI message in a result map.
func extractLastAIMessage(result map[string]any) string {
	messages, _ := result["messages"].([]llms.MessageContent)
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == llms.ChatMessageTypeAI {
			for _, part := range messages[i].Parts {
				if text, ok := part.(llms.TextContent); ok {
					return text.Text
				}
			}
		}
	}
	return ""
}
