package graphs

import (
	"strings"
	"testing"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
)

func TestParseWorkerConfigAcceptsSupportedOutputSchemaProfile(t *testing.T) {
	snapshotNode := &SnapshotNode{Node: &dbmodels.AgentGraphNode{
		NodeKey: "extract",
		Config:  `{"output_schema":{"type":"object","required":["contract_version","items"],"additionalProperties":false,"properties":{"contract_version":{"type":"string","minLength":1,"pattern":"^v2$"},"items":{"type":"array","maxItems":2,"uniqueItems":true,"items":{"type":"object","required":["label","score"],"additionalProperties":false,"properties":{"label":{"type":"string","enum":["match"]},"score":{"type":"number","minimum":0,"maximum":1,"exclusiveMinimum":0}}}}}}}`,
	}}

	config, _, _, err := parseWorkerConfig(snapshotNode)
	if err != nil {
		t.Fatalf("expected supported output schema to decode: %v", err)
	}
	if config.OutputSchema == nil {
		t.Fatal("expected output schema")
	}
	if _, err := normalizeStructuredWorkerOutput(`{"contract_version":"v2","items":[{"label":"match","score":0.5}]}`, config.OutputSchema); err != nil {
		t.Fatalf("expected supported output schema to validate: %v", err)
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
