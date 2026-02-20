package graphs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

const logPreviewLimit = 600

func previewText(s string) string {
	text := strings.TrimSpace(s)
	if text == "" {
		return "<empty>"
	}
	text = strings.Join(strings.Fields(text), " ")
	if len(text) > logPreviewLimit {
		return text[:logPreviewLimit] + "..."
	}
	return text
}

func previewState(v any) string {
	if v == nil {
		return "<nil>"
	}
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("<unmarshalable:%T>", v)
	}
	return previewText(string(bytes.ToValidUTF8(b, []byte{})))
}

func isMaxIterationsMessage(s string) bool {
	return strings.Contains(strings.ToLower(s), "maximum iterations reached")
}
