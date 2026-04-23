package graphs

import (
	"encoding/json"
	"fmt"

	"github.com/smallnest/langgraphgo/graph"
	"github.com/smallnest/langgraphgo/prebuilt"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

type workerAgentConfig struct {
	SystemMessage string
	MaxIterations int
	OutputRetries int                 `json:"output_retries"`
	OutputSchema  *workerOutputSchema `json:"output_schema"`
}

const defaultWorkerMaxIterations = 10
const defaultWorkerOutputRetries = 3

// parseWorkerConfig extracts worker runtime settings from a node's config jsonb.
func parseWorkerConfig(snapshotNode *SnapshotNode) (workerAgentConfig, int, []prebuilt.CreateAgentOption, error) {
	var config workerAgentConfig
	if err := json.Unmarshal([]byte(snapshotNode.Node.Config), &config); err != nil {
		return workerAgentConfig{}, 0, nil, fmt.Errorf("worker node %q: invalid config json: %w", snapshotNode.Node.NodeKey, err)
	}

	maxIterations, opts := buildWorkerAgentOptions(config)
	return config, maxIterations, opts, nil
}

func loadStateString(state map[string]any, key string) (string, error) {
	value, ok := state[key]
	if !ok {
		return "", fmt.Errorf("state is missing %q", key)
	}

	text, ok := value.(string)
	if ok {
		return text, nil
	}

	encoded, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("state %q has type %T and could not be JSON encoded: %w", key, value, err)
	}

	return string(encoded), nil
}

func loadStateMessages(state map[string]any, key string) ([]llms.MessageContent, error) {
	value, ok := state[key]
	if !ok {
		return nil, fmt.Errorf("state is missing %q", key)
	}

	messages, ok := value.([]llms.MessageContent)
	if !ok {
		return nil, fmt.Errorf("state %q has type %T, expected []llms.MessageContent", key, value)
	}

	return messages, nil
}

func loadResultMessages(result map[string]any) ([]llms.MessageContent, error) {
	value, ok := result["messages"]
	if !ok {
		return nil, fmt.Errorf("agent result is missing messages")
	}

	messages, ok := value.([]llms.MessageContent)
	if !ok {
		return nil, fmt.Errorf("agent result messages has type %T, expected []llms.MessageContent", value)
	}

	return messages, nil
}

func extractLastAIMessage(messages []llms.MessageContent) (string, error) {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != llms.ChatMessageTypeAI {
			continue
		}

		for _, part := range messages[i].Parts {
			if text, ok := part.(llms.TextContent); ok {
				return text.Text, nil
			}
		}
	}

	return "", fmt.Errorf("agent result did not include an AI text message")
}

func replaceLastAIMessage(messages []llms.MessageContent, replacement string) ([]llms.MessageContent, error) {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != llms.ChatMessageTypeAI {
			continue
		}

		for j := len(messages[i].Parts) - 1; j >= 0; j-- {
			if _, ok := messages[i].Parts[j].(llms.TextContent); !ok {
				continue
			}

			nextMessages := append([]llms.MessageContent(nil), messages...)
			nextParts := append([]llms.ContentPart(nil), nextMessages[i].Parts...)
			nextParts[j] = llms.TextContent{Text: replacement}
			nextMessages[i].Parts = nextParts
			return nextMessages, nil
		}
	}

	return nil, fmt.Errorf("agent result did not include an AI text message")
}

func buildWorkerAgentOptions(config workerAgentConfig) (int, []prebuilt.CreateAgentOption) {
	var opts []prebuilt.CreateAgentOption
	if config.SystemMessage != "" {
		opts = append(opts, prebuilt.WithSystemMessage(config.SystemMessage))
	}

	maxIterations := defaultWorkerMaxIterations
	if config.MaxIterations > 0 {
		maxIterations = config.MaxIterations
	}

	return maxIterations, opts
}

func outputRetryCount(config workerAgentConfig) int {
	if config.OutputSchema == nil {
		return 1
	}
	if config.OutputRetries > 0 {
		return config.OutputRetries
	}
	return defaultWorkerOutputRetries
}

// buildAgentMap creates a ReAct agent StateRunnable via the prebuilt package.
func buildAgentMap(model llms.Model, graphTools []tools.Tool, maxIterations int, opts ...prebuilt.CreateAgentOption) (*graph.StateRunnable[map[string]any], error) {
	return prebuilt.CreateAgentMap(model, graphTools, maxIterations, opts...)
}
