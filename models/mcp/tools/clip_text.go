package tools

import (
	"bytes"
	"strings"
)

func buildClipTextCandidate(input string) string {
	text := string(bytes.ToValidUTF8([]byte(input), []byte{}))
	return strings.TrimSpace(text)
}
