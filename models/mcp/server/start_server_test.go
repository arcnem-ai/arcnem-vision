package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestStreamableHTTPHandlerSupportsModernAndLegacyProtocols(t *testing.T) {
	server := mcp.NewServer(&mcp.Implementation{Name: "test-server", Version: "1.0.0"}, nil)
	httpServer := httptest.NewServer(newStreamableHTTPHandler(server))
	t.Cleanup(httpServer.Close)

	t.Run("modern", func(t *testing.T) {
		ctx := context.Background()
		client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "1.0.0"}, nil)
		session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: httpServer.URL}, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer session.Close()

		if got := session.InitializeResult().ProtocolVersion; got != "2026-07-28" {
			t.Fatalf("protocol version = %q, want 2026-07-28", got)
		}
		if _, err := session.ListTools(ctx, &mcp.ListToolsParams{}); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("legacy", func(t *testing.T) {
		body := strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"legacy-test","version":"1.0.0"}}}`)
		req, err := http.NewRequest(http.MethodPost, httpServer.URL, body)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want 200", resp.StatusCode)
		}
	})
}
