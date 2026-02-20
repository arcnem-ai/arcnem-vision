package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/arcnem-ai/arcnem-vision/models/agents/clients"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/tmc/langchaingo/tools"
)

// Verify MCPTool satisfies the langchaingo tools.Tool interface.
var _ tools.Tool = (*MCPTool)(nil)

// MCPTool wraps a DB tool definition and proxies calls to the MCP server.
type MCPTool struct {
	dbTool    *dbmodels.Tool
	mcpClient *clients.MCPClient
}

func NewMCPTool(dbTool *dbmodels.Tool, mcpClient *clients.MCPClient) *MCPTool {
	return &MCPTool{dbTool: dbTool, mcpClient: mcpClient}
}

func (t *MCPTool) Name() string {
	return t.dbTool.Name
}

func (t *MCPTool) Description() string {
	return t.dbTool.Description
}

func (t *MCPTool) Call(ctx context.Context, input string) (string, error) {
	var args map[string]any
	if err := json.Unmarshal([]byte(input), &args); err != nil {
		args = map[string]any{"input": input}
	}

	result, err := t.mcpClient.CallTool(ctx, t.dbTool.Name, args)
	if err != nil {
		return "", fmt.Errorf("MCP tool %q: %w", t.dbTool.Name, err)
	}
	if result == nil {
		return "", fmt.Errorf("MCP tool %q returned no result", t.dbTool.Name)
	}

	return extractTextContent(result), nil
}

// DBToolsToLangGraphTools converts DB tool rows into langchaingo tools.
func DBToolsToLangGraphTools(dbTools []*dbmodels.Tool, mcpClient *clients.MCPClient) []tools.Tool {
	out := make([]tools.Tool, len(dbTools))
	for i, t := range dbTools {
		out[i] = NewMCPTool(t, mcpClient)
	}
	return out
}

func extractTextContent(result *mcp.CallToolResult) string {
	if result == nil {
		return ""
	}
	for _, c := range result.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			return tc.Text
		}
	}
	return ""
}
