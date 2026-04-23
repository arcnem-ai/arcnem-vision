package graphs

import (
	"reflect"
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

func TestResolveToolInputMappingValue_ObjectLiteral(t *testing.T) {
	state := map[string]any{
		"temp_url": "https://example.com/image.png",
	}

	got, ok := resolveToolInputMappingValue(map[string]any{
		"text_prompt": "_const:passport",
		"threshold":   0.5,
	}, state)
	if !ok {
		t.Fatal("expected literal object mapping to resolve")
	}

	want := map[string]any{
		"text_prompt": "passport",
		"threshold":   0.5,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestResolveToolInputMappingValue_NestedStateLookup(t *testing.T) {
	state := map[string]any{
		"segmentation_prompt": "rocky shoreline",
	}

	got, ok := resolveToolInputMappingValue(map[string]any{
		"text_prompt": "segmentation_prompt",
		"mode":        "_const:fast",
	}, state)
	if !ok {
		t.Fatal("expected nested state lookup to resolve")
	}

	want := map[string]any{
		"text_prompt": "rocky shoreline",
		"mode":        "fast",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestResolveToolInputMappingValue_StateLookup(t *testing.T) {
	state := map[string]any{
		"temp_url": "https://example.com/image.png",
	}

	got, ok := resolveToolInputMappingValue("temp_url", state)
	if !ok {
		t.Fatal("expected state lookup to resolve")
	}
	if got != "https://example.com/image.png" {
		t.Fatalf("unexpected mapped value: %v", got)
	}
}

func TestResolveToolInputMappingValue_StringConstant(t *testing.T) {
	got, ok := resolveToolInputMappingValue("_const:REPLICATE", map[string]any{})
	if !ok {
		t.Fatal("expected string constant to resolve")
	}
	if got != "REPLICATE" {
		t.Fatalf("expected REPLICATE, got %v", got)
	}
}

func TestMapToolOutputToState_DefaultsToSchemaFieldNames(t *testing.T) {
	got := mapToolOutputToState(
		map[string]any{
			"description_id": "desc-123",
			"text":           "saved text",
		},
		[]string{"description_id", "text"},
		nil,
	)

	want := map[string]any{
		"description_id": "desc-123",
		"text":           "saved text",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestMapToolOutputToState_RestrictsToExplicitMappings(t *testing.T) {
	got := mapToolOutputToState(
		map[string]any{
			"description_id": "desc-123",
			"text":           "saved text",
		},
		[]string{"description_id", "text"},
		map[string]string{
			"description_id": "document_description_id",
		},
	)

	want := map[string]any{
		"document_description_id": "desc-123",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}
