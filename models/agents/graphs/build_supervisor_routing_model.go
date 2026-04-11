package graphs

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

func supervisorSystemPrompt(cfg supervisorConfig) string {
	return fmt.Sprintf(
		"You are a supervisor tasked with managing a conversation between the following workers: %s. "+
			"Given the conversation so far, respond with the worker to act next or FINISH when the task is complete. "+
			"Use the 'route' tool to make your selection.",
		strings.Join(cfg.Members, ", "),
	)
}

func supervisorRouteTool(options []any) llms.Tool {
	return llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name:        "route",
			Description: "Select the next worker to act, or FINISH if the task is complete.",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"next": map[string]any{
						"type": "string",
						"enum": options,
					},
				},
				"required": []string{"next"},
			},
		},
	}
}

func parseSupervisorRouteArguments(arguments string) (string, error) {
	var args struct {
		Next string `json:"next"`
	}

	if err := json.Unmarshal([]byte(arguments), &args); err != nil {
		return "", fmt.Errorf("failed to parse route arguments: %w", err)
	}

	next := strings.TrimSpace(args.Next)
	if next == "" {
		return "", fmt.Errorf("route tool arguments must include a non-empty next value")
	}

	return next, nil
}
