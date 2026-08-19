package graphs

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// workerOutputSchema supports type, properties, required, and
// additionalProperties at the root. Properties additionally support type,
// enum, properties, required, additionalProperties, items, minimum, maximum,
// exclusiveMinimum, pattern, minLength, maxItems, and uniqueItems.
type workerOutputSchema struct {
	Type                 string                          `json:"type"`
	Properties           map[string]workerOutputProperty `json:"properties"`
	Required             []string                        `json:"required"`
	AdditionalProperties *bool                           `json:"additionalProperties"`
}

type workerOutputProperty struct {
	Type                 any                             `json:"type"`
	Enum                 []string                        `json:"enum,omitempty"`
	Properties           map[string]workerOutputProperty `json:"properties,omitempty"`
	Required             []string                        `json:"required,omitempty"`
	AdditionalProperties *bool                           `json:"additionalProperties,omitempty"`
	Items                *workerOutputProperty           `json:"items,omitempty"`
	Minimum              *float64                        `json:"minimum,omitempty"`
	Maximum              *float64                        `json:"maximum,omitempty"`
	ExclusiveMinimum     *float64                        `json:"exclusiveMinimum,omitempty"`
	Pattern              string                          `json:"pattern,omitempty"`
	MinLength            *int                            `json:"minLength,omitempty"`
	MaxItems             *int                            `json:"maxItems,omitempty"`
	UniqueItems          bool                            `json:"uniqueItems,omitempty"`
}

func (schema *workerOutputSchema) UnmarshalJSON(data []byte) error {
	type supportedWorkerOutputSchema workerOutputSchema

	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()

	var decoded supportedWorkerOutputSchema
	if err := decoder.Decode(&decoded); err != nil {
		return fmt.Errorf("unsupported worker output schema: %w", err)
	}

	*schema = workerOutputSchema(decoded)
	return nil
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

	return validateStructuredWorkerOutputObject("", record, schema.Properties, schema.Required, schema.AdditionalProperties)
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

	if object, ok := value.(map[string]any); ok && property.Properties != nil {
		if err := validateStructuredWorkerOutputObject(
			field,
			object,
			property.Properties,
			property.Required,
			property.AdditionalProperties,
		); err != nil {
			return err
		}
	}

	if values, ok := value.([]any); ok {
		if property.MaxItems != nil && len(values) > *property.MaxItems {
			return fmt.Errorf("field %q must contain at most %d items", field, *property.MaxItems)
		}
		if property.UniqueItems {
			seen := make(map[string]struct{}, len(values))
			for _, item := range values {
				encoded, err := json.Marshal(item)
				if err != nil {
					return fmt.Errorf("field %q could not compare array items: %w", field, err)
				}
				key := string(encoded)
				if _, exists := seen[key]; exists {
					return fmt.Errorf("field %q must contain unique items", field)
				}
				seen[key] = struct{}{}
			}
		}
		if property.Items != nil {
			for index, item := range values {
				if err := validateStructuredWorkerOutputValue(fmt.Sprintf("%s[%d]", field, index), item, *property.Items); err != nil {
					return err
				}
			}
		}
	}

	if number, ok := value.(float64); ok {
		if property.Minimum != nil && number < *property.Minimum {
			return fmt.Errorf("field %q must be at least %v", field, *property.Minimum)
		}
		if property.Maximum != nil && number > *property.Maximum {
			return fmt.Errorf("field %q must be at most %v", field, *property.Maximum)
		}
		if property.ExclusiveMinimum != nil && number <= *property.ExclusiveMinimum {
			return fmt.Errorf("field %q must be greater than %v", field, *property.ExclusiveMinimum)
		}
	}

	if text, ok := value.(string); ok {
		if property.MinLength != nil && utf8.RuneCountInString(text) < *property.MinLength {
			return fmt.Errorf("field %q must have at least %d characters", field, *property.MinLength)
		}
		if property.Pattern != "" {
			matched, err := regexp.MatchString(property.Pattern, text)
			if err != nil {
				return fmt.Errorf("field %q has invalid pattern %q: %w", field, property.Pattern, err)
			}
			if !matched {
				return fmt.Errorf("field %q must match %q", field, property.Pattern)
			}
		}
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

func validateStructuredWorkerOutputObject(
	field string,
	record map[string]any,
	properties map[string]workerOutputProperty,
	required []string,
	additionalProperties *bool,
) error {
	for _, key := range required {
		if _, ok := record[key]; !ok {
			return fmt.Errorf("missing required field %q", joinWorkerOutputField(field, key))
		}
	}

	allowAdditional := additionalProperties == nil || *additionalProperties
	for key, value := range record {
		property, ok := properties[key]
		if !ok {
			if !allowAdditional {
				return fmt.Errorf("unexpected field %q", joinWorkerOutputField(field, key))
			}
			continue
		}
		if err := validateStructuredWorkerOutputValue(joinWorkerOutputField(field, key), value, property); err != nil {
			return err
		}
	}

	return nil
}

func joinWorkerOutputField(parent string, child string) string {
	if parent == "" {
		return child
	}
	return parent + "." + child
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
