package tools

import (
	"fmt"
	"strings"
)

// parseEmbedding extracts the float array from Replicate CLIP output
// and converts it to a pgvector string like "[0.1,0.2,...]".
func parseEmbedding(output map[string]any) (string, error) {
	embeddingRaw, ok := output["embedding"]
	if !ok {
		return "", fmt.Errorf("no 'embedding' key in output")
	}

	floats, ok := embeddingRaw.([]any)
	if !ok {
		return "", fmt.Errorf("embedding is not an array: %T", embeddingRaw)
	}

	parts := make([]string, len(floats))
	for i, v := range floats {
		f, ok := v.(float64)
		if !ok {
			return "", fmt.Errorf("embedding[%d] is not a float: %T", i, v)
		}
		parts[i] = fmt.Sprintf("%g", f)
	}

	return "[" + strings.Join(parts, ",") + "]", nil
}
