package graphs

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const constPrefix = "_const:"

// BuildToolNode creates a programmatic node that calls a single MCP tool.
// It uses the tool's inputSchema/outputSchema for field names, with optional
// input_mapping/output_mapping in the node config to rename state keys.
// Mapped values prefixed with "_const:" are treated as literal constants
// (e.g. "_const:OPENAI" → the string "OPENAI").
func BuildToolNode(snapshotNode *SnapshotNode, mcpClient *clients.MCPClient) (*NodeToAdd, error) {
	if len(snapshotNode.Tools) != 1 {
		return nil, fmt.Errorf("tool node %q requires exactly 1 tool, got %d", snapshotNode.Node.NodeKey, len(snapshotNode.Tools))
	}
	if mcpClient == nil {
		return nil, fmt.Errorf("tool node %q: mcp client is nil", snapshotNode.Node.NodeKey)
	}

	dbTool := snapshotNode.Tools[0]

	var config struct {
		InputMapping  map[string]string `json:"input_mapping"`
		OutputMapping map[string]string `json:"output_mapping"`
	}
	if err := json.Unmarshal([]byte(snapshotNode.Node.Config), &config); err != nil {
		return nil, fmt.Errorf("tool node %q: invalid config json: %w", snapshotNode.Node.NodeKey, err)
	}

	// Parse the tool's input schema to get expected field names.
	inputFields, err := schemaFieldNames(dbTool.InputSchema)
	if err != nil {
		return nil, fmt.Errorf("tool node %q: invalid input schema: %w", snapshotNode.Node.NodeKey, err)
	}
	outputFields, err := schemaFieldNames(dbTool.OutputSchema)
	if err != nil {
		return nil, fmt.Errorf("tool node %q: invalid output schema: %w", snapshotNode.Node.NodeKey, err)
	}

	return &NodeToAdd{
		Name:        snapshotNode.Node.NodeKey,
		Description: snapshotNode.Node.NodeKey,
		Fn: func(ctx context.Context, state map[string]any) (map[string]any, error) {
			// Build tool input: for each field in the tool's input schema,
			// check if input_mapping has a rename, otherwise use field name as state key.
			toolInput := make(map[string]any)
			for _, field := range inputFields {
				if mapped, ok := config.InputMapping[field]; ok {
					if strings.HasPrefix(mapped, constPrefix) {
						toolInput[field] = strings.TrimPrefix(mapped, constPrefix)
						continue
					}
					if v, ok := state[mapped]; ok {
						toolInput[field] = v
					}
				} else if v, ok := state[field]; ok {
					toolInput[field] = v
				}
			}

			result, err := mcpClient.CallTool(ctx, dbTool.Name, toolInput)
			if err != nil {
				return nil, fmt.Errorf("tool node %q: %w", snapshotNode.Node.NodeKey, err)
			}

			toolOutput, err := decodeToolOutput(result, outputFields)
			if err != nil {
				return nil, fmt.Errorf("tool node %q: %w", snapshotNode.Node.NodeKey, err)
			}

			// Map tool output fields to state: for each field in the tool's output schema,
			// check if output_mapping has a rename, otherwise use field name as state key.
			delta := make(map[string]any)
			for _, field := range outputFields {
				stateKey := field
				if mapped, ok := config.OutputMapping[field]; ok {
					stateKey = mapped
				}
				if v, ok := toolOutput[field]; ok {
					delta[stateKey] = v
				}
			}

			return delta, nil
		},
	}, nil
}

func decodeToolOutput(result *mcp.CallToolResult, outputFields []string) (map[string]any, error) {
	if len(outputFields) == 0 {
		return map[string]any{}, nil
	}
	if result == nil {
		return nil, fmt.Errorf("tool returned no result")
	}
	if result.IsError {
		return nil, fmt.Errorf("tool returned error: %s", toolErrorText(result))
	}

	if parsed, ok, err := parseStructuredOutput(result.StructuredContent); err != nil {
		return nil, fmt.Errorf("invalid structured tool output: %w", err)
	} else if ok {
		return parsed, nil
	}

	var firstText string
	for _, c := range result.Content {
		tc, ok := c.(*mcp.TextContent)
		if !ok {
			continue
		}
		text := strings.TrimSpace(tc.Text)
		if text == "" {
			continue
		}
		if firstText == "" {
			firstText = text
		}

		var parsed map[string]any
		if err := json.Unmarshal([]byte(text), &parsed); err == nil {
			return parsed, nil
		}
	}

	if firstText != "" {
		return nil, fmt.Errorf("failed to parse tool output json from text content: %q", trimErrorText(firstText))
	}
	return nil, fmt.Errorf("tool returned no text output")
}

func parseStructuredOutput(v any) (map[string]any, bool, error) {
	if v == nil {
		return nil, false, nil
	}
	if out, ok := v.(map[string]any); ok {
		return out, true, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, false, err
	}
	var out map[string]any
	if err := json.Unmarshal(b, &out); err != nil {
		return nil, false, err
	}
	return out, true, nil
}

func toolErrorText(result *mcp.CallToolResult) string {
	textParts := make([]string, 0, len(result.Content))
	for _, c := range result.Content {
		tc, ok := c.(*mcp.TextContent)
		if !ok {
			continue
		}
		text := strings.TrimSpace(tc.Text)
		if text == "" {
			continue
		}
		textParts = append(textParts, text)
	}
	if len(textParts) == 0 {
		return "unknown tool error"
	}
	return strings.Join(textParts, "; ")
}

func trimErrorText(s string) string {
	const maxErrTextLen = 160
	if len(s) <= maxErrTextLen {
		return s
	}
	return s[:maxErrTextLen] + "..."
}

// schemaFieldNames extracts the top-level property names from a JSON Schema stored as a string.
// Expects format: {"type":"object","properties":{"field1":{...},"field2":{...}}}
func schemaFieldNames(schemaJSON string) ([]string, error) {
	var schema struct {
		Properties map[string]any `json:"properties"`
	}
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		return nil, err
	}

	names := make([]string, 0, len(schema.Properties))
	for k := range schema.Properties {
		names = append(names, k)
	}
	return names, nil
}
