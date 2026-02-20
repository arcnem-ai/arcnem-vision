package graphs

import (
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestDecodeToolOutput_IsError(t *testing.T) {
	result := &mcp.CallToolResult{
		IsError: true,
		Content: []mcp.Content{
			&mcp.TextContent{Text: "replicate CLIP failed"},
		},
	}

	_, err := decodeToolOutput(result, []string{"embedding_id"})
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "tool returned error: replicate CLIP failed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDecodeToolOutput_ParsesStructuredOutput(t *testing.T) {
	result := &mcp.CallToolResult{
		StructuredContent: map[string]any{
			"embedding_id": "abc",
		},
	}

	out, err := decodeToolOutput(result, []string{"embedding_id"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := out["embedding_id"]; got != "abc" {
		t.Fatalf("expected embedding_id=abc, got %v", got)
	}
}

func TestDecodeToolOutput_SkipsNonJSONTextAndParsesJSON(t *testing.T) {
	result := &mcp.CallToolResult{
		Content: []mcp.Content{
			&mcp.TextContent{Text: "result available"},
			&mcp.TextContent{Text: `{"embedding_id":"abc"}`},
		},
	}

	out, err := decodeToolOutput(result, []string{"embedding_id"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := out["embedding_id"]; got != "abc" {
		t.Fatalf("expected embedding_id=abc, got %v", got)
	}
}

func TestDecodeToolOutput_IgnoresOutputWhenSchemaHasNoFields(t *testing.T) {
	out, err := decodeToolOutput(nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("expected empty output, got %v", out)
	}
}
