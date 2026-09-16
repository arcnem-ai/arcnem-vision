package graphs

import (
	"encoding/json"
	"strings"
	"testing"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
)

func TestParseWorkerConfigAcceptsSupportedOutputSchemaProfile(t *testing.T) {
	snapshotNode := &SnapshotNode{Node: &dbmodels.AgentGraphNode{
		NodeKey: "extract",
		Config:  `{"provider_strict_output":true,"output_schema":{"type":"object","required":["contract_version","items"],"additionalProperties":false,"properties":{"contract_version":{"type":"string","minLength":1,"pattern":"^v2$"},"items":{"type":"array","maxItems":2,"uniqueItems":true,"items":{"type":"object","required":["label","score"],"additionalProperties":false,"properties":{"label":{"type":"string","enum":["match"]},"score":{"type":"number","minimum":0,"maximum":1,"exclusiveMinimum":0}}}}}}}`,
	}}

	config, _, _, err := parseWorkerConfig(snapshotNode)
	if err != nil {
		t.Fatalf("expected supported output schema to decode: %v", err)
	}
	if config.OutputSchema == nil {
		t.Fatal("expected output schema")
	}
	if config.GenerationConfig.StructuredOutput == nil || config.GenerationConfig.StructuredOutput.Name != "worker_output" {
		t.Fatal("expected provider strict output schema")
	}
	providerSchema, err := json.Marshal(config.GenerationConfig.StructuredOutput.Schema)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(providerSchema), "uniqueItems") {
		t.Fatalf("provider schema retained unsupported uniqueItems: %s", providerSchema)
	}
	if _, err := normalizeStructuredWorkerOutput(`{"contract_version":"v2","items":[{"label":"match","score":0.5},{"label":"match","score":0.5}]}`, config.OutputSchema); err == nil || !strings.Contains(err.Error(), "must contain unique items") {
		t.Fatalf("local schema lost uniqueItems validation: %v", err)
	}
	if _, err := normalizeStructuredWorkerOutput(`{"contract_version":"v2","items":[{"label":"match","score":0.5}]}`, config.OutputSchema); err != nil {
		t.Fatalf("expected supported output schema to validate: %v", err)
	}
}

func TestProviderStrictWorkerOutputSchemaPreparesProviderCopy(t *testing.T) {
	additionalProperties := false
	schema := &workerOutputSchema{
		Type:                 "object",
		Required:             []string{"status", "uniqueItems", "details"},
		AdditionalProperties: &additionalProperties,
		Properties: map[string]workerOutputProperty{
			"status": {
				Type: []any{"string", "null"},
				Enum: []string{"ready"},
			},
			"uniqueItems": {Type: "string"},
			"details": {
				Type:                 "object",
				AdditionalProperties: &additionalProperties,
			},
		},
	}

	prepared, err := providerStrictWorkerOutputSchema(schema)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(prepared)
	if err != nil {
		t.Fatal(err)
	}
	providerJSON := string(encoded)
	for _, want := range []string{
		`"status":{"enum":["ready",null],"type":["string","null"]}`,
		`"uniqueItems":{"type":"string"}`,
		`"details":{"additionalProperties":false,"properties":{},"required":[],"type":"object"}`,
	} {
		if !strings.Contains(providerJSON, want) {
			t.Fatalf("provider schema %s does not contain %s", providerJSON, want)
		}
	}
	if len(schema.Properties["status"].Enum) != 1 {
		t.Fatalf("local schema enum was mutated: %#v", schema.Properties["status"].Enum)
	}

	empty, err := providerStrictWorkerOutputSchema(&workerOutputSchema{
		Type:                 "object",
		AdditionalProperties: &additionalProperties,
	})
	if err != nil {
		t.Fatal(err)
	}
	if emptyJSON, _ := json.Marshal(empty); !strings.Contains(string(emptyJSON), `"properties":{},"required":[]`) {
		t.Fatalf("empty provider object was not normalized: %s", emptyJSON)
	}
}

func TestParseWorkerConfigRejectsNonStrictProviderSchema(t *testing.T) {
	tests := []struct {
		name   string
		config string
		want   string
	}{
		{
			name:   "missing output schema",
			config: `{"provider_strict_output":true}`,
			want:   "provider_strict_output requires output_schema",
		},
		{
			name:   "root type",
			config: `{"provider_strict_output":true,"output_schema":{"type":"array","required":[],"additionalProperties":false,"properties":{}}}`,
			want:   "must declare type object",
		},
		{
			name:   "root additional properties",
			config: `{"provider_strict_output":true,"output_schema":{"type":"object","required":[],"properties":{}}}`,
			want:   "must set additionalProperties to false",
		},
		{
			name:   "missing required field",
			config: `{"provider_strict_output":true,"output_schema":{"type":"object","required":[],"additionalProperties":false,"properties":{"answer":{"type":"string"}}}}`,
			want:   `must require field "answer"`,
		},
		{
			name:   "unknown required field",
			config: `{"provider_strict_output":true,"output_schema":{"type":"object","required":["missing"],"additionalProperties":false,"properties":{}}}`,
			want:   `requires unknown field "missing"`,
		},
		{
			name:   "nested object",
			config: `{"provider_strict_output":true,"output_schema":{"type":"object","required":["item"],"additionalProperties":false,"properties":{"item":{"type":"object","required":[],"additionalProperties":true,"properties":{"answer":{"type":"string"}}}}}}`,
			want:   `object "item" must set additionalProperties to false`,
		},
		{
			name:   "nested array without items",
			config: `{"provider_strict_output":true,"output_schema":{"type":"object","required":["items"],"additionalProperties":false,"properties":{"items":{"type":"array","items":{"type":"array"}}}}}`,
			want:   `array "items[]" must define items`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			snapshotNode := &SnapshotNode{Node: &dbmodels.AgentGraphNode{NodeKey: "extract", Config: test.config}}
			_, _, _, err := parseWorkerConfig(snapshotNode)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q, got %v", test.want, err)
			}
		})
	}
}

func TestParseWorkerConfigRejectsUnsupportedOutputSchemaKeyword(t *testing.T) {
	snapshotNode := &SnapshotNode{Node: &dbmodels.AgentGraphNode{
		NodeKey: "extract",
		Config:  `{"output_schema":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":10}}}}}}}`,
	}}

	_, _, _, err := parseWorkerConfig(snapshotNode)
	if err == nil {
		t.Fatal("expected unsupported output schema keyword to fail")
	}
	if !strings.Contains(err.Error(), `unsupported worker output schema: json: unknown field "maxLength"`) {
		t.Fatalf("expected clear unsupported-keyword error, got %v", err)
	}
}

func TestNormalizeStructuredWorkerOutputValidatesExtendedSchemaProfile(t *testing.T) {
	snapshotNode := &SnapshotNode{Node: &dbmodels.AgentGraphNode{
		NodeKey: "extract",
		Config:  `{"output_schema":{"type":"object","properties":{"contract_version":{"type":"string","minLength":1},"items":{"type":"array","maxItems":2,"uniqueItems":true,"items":{"type":"object","properties":{"score":{"type":"number","exclusiveMinimum":0}}}}}}}`,
	}}

	config, _, _, err := parseWorkerConfig(snapshotNode)
	if err != nil {
		t.Fatalf("expected extended output schema to decode: %v", err)
	}

	tests := []struct {
		name   string
		output string
		want   string
	}{
		{name: "minLength", output: `{"contract_version":"","items":[]}`, want: `field "contract_version" must have at least 1 characters`},
		{name: "maxItems", output: `{"contract_version":"v2","items":[{"score":1},{"score":2},{"score":3}]}`, want: `field "items" must contain at most 2 items`},
		{name: "uniqueItems", output: `{"contract_version":"v2","items":[{"score":1},{"score":1}]}`, want: `field "items" must contain unique items`},
		{name: "exclusiveMinimum", output: `{"contract_version":"v2","items":[{"score":0}]}`, want: `field "items[0].score" must be greater than 0`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := normalizeStructuredWorkerOutput(test.output, config.OutputSchema)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q, got %v", test.want, err)
			}
		})
	}
}

func TestNormalizeStructuredWorkerOutputValidatesNestedArrayItems(t *testing.T) {
	additionalProperties := false
	schema := &workerOutputSchema{
		Type:                 "object",
		Required:             []string{"observations"},
		AdditionalProperties: &additionalProperties,
		Properties: map[string]workerOutputProperty{
			"observations": {
				Type: "array",
				Items: &workerOutputProperty{
					Type:                 "object",
					Required:             []string{"product", "price", "currency"},
					AdditionalProperties: &additionalProperties,
					Properties: map[string]workerOutputProperty{
						"product": {Type: "string"},
						"price":   {Type: "integer", Minimum: float64Ptr(1)},
						"currency": {
							Type:    "string",
							Pattern: `^[A-Z]{3}$`,
						},
					},
				},
			},
		},
	}

	if _, err := normalizeStructuredWorkerOutput(`{"observations":[{"product":"Tea","price":128,"currency":"JPY"}]}`, schema); err != nil {
		t.Fatalf("expected valid nested output: %v", err)
	}

	_, err := normalizeStructuredWorkerOutput(`{"observations":[{"product":"Tea","price_text":"128","currency":"円"}]}`, schema)
	if err == nil || !strings.Contains(err.Error(), `observations[0].price`) {
		t.Fatalf("expected nested required-field error, got %v", err)
	}

	_, err = normalizeStructuredWorkerOutput(`{"observations":[{"product":"Tea","price":128,"currency":"円"}]}`, schema)
	if err == nil || !strings.Contains(err.Error(), `observations[0].currency`) {
		t.Fatalf("expected nested pattern error, got %v", err)
	}
}

func float64Ptr(value float64) *float64 {
	return &value
}
