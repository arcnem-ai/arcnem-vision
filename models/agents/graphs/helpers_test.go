package graphs

import (
	"encoding/json"
	"testing"
)

func TestLoadStateStringReturnsExistingStrings(t *testing.T) {
	value, err := loadStateString(map[string]any{"temp_url": "https://example.com"}, "temp_url")
	if err != nil {
		t.Fatalf("loadStateString returned error: %v", err)
	}

	if value != "https://example.com" {
		t.Fatalf("expected original string, got %q", value)
	}
}

func TestLoadStateStringJSONEncodesStructuredValues(t *testing.T) {
	value, err := loadStateString(map[string]any{
		"document_ids": []string{"doc-1", "doc-2"},
	}, "document_ids")
	if err != nil {
		t.Fatalf("loadStateString returned error: %v", err)
	}

	if value != `["doc-1","doc-2"]` {
		t.Fatalf("expected json array, got %q", value)
	}
}

func TestLoadStateStringJSONEncodesObjects(t *testing.T) {
	value, err := loadStateString(map[string]any{
		"scope": map[string]any{
			"deviceBound": false,
			"documentIds": []string{"doc-1"},
		},
	}, "scope")
	if err != nil {
		t.Fatalf("loadStateString returned error: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal([]byte(value), &decoded); err != nil {
		t.Fatalf("expected valid json object, got error: %v", err)
	}

	if decoded["deviceBound"] != false {
		t.Fatalf("expected deviceBound=false, got %#v", decoded["deviceBound"])
	}
}
