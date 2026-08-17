package graphs

import (
	"strings"
	"testing"
)

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
