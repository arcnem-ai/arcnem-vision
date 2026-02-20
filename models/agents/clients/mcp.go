package clients

import (
	"context"
	"fmt"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type MCPClient struct {
	client   *mcp.Client
	endpoint string
}

func NewMCPClient() (*MCPClient, error) {
	endpoint := os.Getenv("MCP_SERVER_URL")
	if endpoint == "" {
		return nil, fmt.Errorf("MCP_SERVER_URL not set")
	}

	return &MCPClient{
		client: mcp.NewClient(&mcp.Implementation{
			Name:    os.Getenv("MCP_CLIENT_NAME"),
			Version: os.Getenv("MCP_CLIENT_VERSION"),
		}, nil),
		endpoint: endpoint,
	}, nil
}

func (m *MCPClient) CallTool(ctx context.Context, toolName string, args map[string]any) (*mcp.CallToolResult, error) {
	session, err := m.client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint: m.endpoint,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to MCP server at %s: %w", m.endpoint, err)
	}
	defer session.Close()

	result, callErr := session.CallTool(ctx, &mcp.CallToolParams{
		Name:      toolName,
		Arguments: args,
	})
	if callErr != nil {
		return nil, fmt.Errorf("MCP call tool %q via %s: %w", toolName, m.endpoint, callErr)
	}
	return result, nil
}
