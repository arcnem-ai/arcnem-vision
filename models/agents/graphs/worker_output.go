package graphs

import (
	"encoding/json"
	"fmt"
	"strings"
)

type workerOutputSchema struct {
	Type                 string                          `json:"type"`
	Properties           map[string]workerOutputProperty `json:"properties"`
	Required             []string                        `json:"required"`
	AdditionalProperties *bool                           `json:"additionalProperties"`
}

type workerOutputProperty struct {
	Type any      `json:"type"`
	Enum []string `json:"enum"`
}

func normalizeStructuredWorkerOutput(output string, schema *workerOutputSchema) (string, error) {
	if schema == nil {
		return output, nil
	}

	record, err := parseStructuredWorkerOutput(output)
	if err != nil {
		return "", err
	}
	if err := validateStructuredWorkerOutput(record, schema); err != nil {
		return "", err
	}

	normalized, err := json.Marshal(record)
	if err != nil {
		return "", fmt.Errorf("failed to encode structured output: %w", err)
	}

	return string(normalized), nil
}

func buildWorkerOutputRepairPrompt(err error, schema *workerOutputSchema) string {
	schemaJSON, marshalErr := json.Marshal(schema)
	if marshalErr != nil {
		return fmt.Sprintf("Your previous response was invalid: %v. Return only a corrected JSON object.", err)
	}

	return fmt.Sprintf(
		"Your previous response was invalid: %v. Return only a corrected JSON object that satisfies this schema: %s",
		err,
		string(schemaJSON),
	)
}

func parseStructuredWorkerOutput(output string) (map[string]any, error) {
	trimmed := stripWorkerOutputCodeFence(output)

	var parsed map[string]any
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil, fmt.Errorf("expected a valid JSON object: %w", err)
	}

	if parsed == nil {
		return nil, fmt.Errorf("expected a JSON object")
	}

	return parsed, nil
}

func stripWorkerOutputCodeFence(value string) string {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}

	return strings.TrimSpace(
		strings.TrimSuffix(
			strings.TrimPrefix(strings.TrimPrefix(trimmed, "```json"), "```"),
			"```",
		),
	)
}

func validateStructuredWorkerOutput(record map[string]any, schema *workerOutputSchema) error {
	if schema == nil {
		return nil
	}
	if schema.Type != "" && schema.Type != "object" {
		return fmt.Errorf("worker output schema must declare type object")
	}

	for _, key := range schema.Required {
		if _, ok := record[key]; !ok {
			return fmt.Errorf("missing required field %q", key)
		}
	}

	allowAdditional := true
	if schema.AdditionalProperties != nil {
		allowAdditional = *schema.AdditionalProperties
	}

	for key, value := range record {
		propertySchema, ok := schema.Properties[key]
		if !ok {
			if !allowAdditional {
				return fmt.Errorf("unexpected field %q", key)
			}
			continue
		}

		if err := validateStructuredWorkerOutputValue(key, value, propertySchema); err != nil {
			return err
		}
	}

	return nil
}

func validateStructuredWorkerOutputValue(field string, value any, property workerOutputProperty) error {
	allowedTypes, err := workerOutputTypes(property.Type)
	if err != nil {
		return fmt.Errorf("field %q has invalid schema: %w", field, err)
	}

	if value == nil {
		if allowedTypes["null"] {
			return nil
		}
		return fmt.Errorf("field %q does not allow null", field)
	}

	if !matchesWorkerOutputType(value, allowedTypes) {
		return fmt.Errorf("field %q has invalid type %T", field, value)
	}

	if len(property.Enum) == 0 {
		return nil
	}

	textValue, ok := value.(string)
	if !ok {
		return fmt.Errorf("field %q must be a string to use enum validation", field)
	}
	for _, allowed := range property.Enum {
		if textValue == allowed {
			return nil
		}
	}

	return fmt.Errorf("field %q must be one of %v", field, property.Enum)
}

func workerOutputTypes(raw any) (map[string]bool, error) {
	allowed := make(map[string]bool)

	switch value := raw.(type) {
	case string:
		allowed[value] = true
	case []any:
		for _, item := range value {
			text, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("type entries must be strings")
			}
			allowed[text] = true
		}
	case nil:
		return allowed, nil
	default:
		return nil, fmt.Errorf("unsupported type declaration %T", raw)
	}

	return allowed, nil
}

func matchesWorkerOutputType(value any, allowedTypes map[string]bool) bool {
	switch typed := value.(type) {
	case string:
		return allowedTypes["string"]
	case bool:
		return allowedTypes["boolean"]
	case float64:
		if allowedTypes["number"] {
			return true
		}
		return allowedTypes["integer"] && typed == float64(int64(typed))
	case []any:
		return allowedTypes["array"]
	case map[string]any:
		return allowedTypes["object"]
	default:
		return false
	}
}
