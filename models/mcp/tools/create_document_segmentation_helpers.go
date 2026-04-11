package tools

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

func cloneMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func normalizeDerivedImageContentType(contentType string, data []byte) string {
	normalized := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	if strings.HasPrefix(normalized, "image/") {
		return normalized
	}

	detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(data), ";")[0]))
	if strings.HasPrefix(detected, "image/") {
		return detected
	}

	return "image/png"
}

func buildSegmentedObjectKey(
	sourceDocumentID string,
	provider string,
	modelName string,
	version string,
	contentType string,
) string {
	extension := ".png"
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg":
		extension = ".jpg"
	case "image/webp":
		extension = ".webp"
	case "image/gif":
		extension = ".gif"
	case "image/png":
		extension = ".png"
	}

	modelSlug := sanitizeObjectKeySegment(provider + "-" + modelName)
	versionSlug := sanitizeObjectKeySegment(strings.TrimSpace(version))
	if versionSlug == "" {
		versionSlug = "unversioned"
	}

	return fmt.Sprintf(
		"derived/segmentations/%s/%s-%s-%d%s",
		sourceDocumentID,
		modelSlug,
		versionSlug,
		time.Now().UnixNano(),
		extension,
	)
}

func sanitizeObjectKeySegment(value string) string {
	replacer := strings.NewReplacer(
		"/", "-",
		"\\", "-",
		":", "-",
		" ", "-",
		".", "-",
		"_", "-",
	)
	sanitized := replacer.Replace(strings.ToLower(strings.TrimSpace(value)))
	sanitized = strings.Trim(sanitized, "-")
	if sanitized == "" {
		return "value"
	}
	return sanitized
}
