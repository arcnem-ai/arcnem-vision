package graphs

import (
	"encoding/json"
	"testing"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/smallnest/langgraphgo/prebuilt"
)

func TestParseWorkerConfigAppliesDashboardJSONKeys(t *testing.T) {
	snapshotNode := &SnapshotNode{Node: &dbmodels.AgentGraphNode{
		NodeKey: "summarize",
		Config:  `{"system_message":"Only report visible facts.","max_iterations":4}`,
	}}

	config, maxIterations, opts, err := parseWorkerConfig(snapshotNode)
	if err != nil {
		t.Fatalf("parseWorkerConfig returned error: %v", err)
	}
	if config.SystemMessage != "Only report visible facts." {
		t.Fatalf("expected dashboard system_message, got %q", config.SystemMessage)
	}
	if maxIterations != 4 {
		t.Fatalf("expected dashboard max_iterations=4, got %d", maxIterations)
	}

	applied := &prebuilt.CreateAgentOptions{}
	for _, opt := range opts {
		opt(applied)
	}
	if applied.SystemMessage != config.SystemMessage {
		t.Fatalf("expected worker system message %q, got %q", config.SystemMessage, applied.SystemMessage)
	}
}

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
			"apiKeyBound": false,
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

	if decoded["apiKeyBound"] != false {
		t.Fatalf("expected apiKeyBound=false, got %#v", decoded["apiKeyBound"])
	}
}
