package utils

import "encoding/json"

func DecodeJSONSlice[T any](raw json.RawMessage) ([]*T, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return make([]*T, 0), nil
	}

	result := make([]*T, 0)
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}

	return result, nil
}
