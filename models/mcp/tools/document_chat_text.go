package tools

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

func buildSearchSnippet(query string, description string, ocrText string, objectKey string, projectName string, apiKeyName *string) (string, string) {
	queryTerms := splitTerms(query)
	if snippet := excerptAroundTerms(description, queryTerms, 220); snippet != "" {
		return snippet, "description"
	}
	if snippet := excerptAroundTerms(ocrText, queryTerms, 220); snippet != "" {
		return snippet, "OCR text"
	}

	metadataFields := []string{projectName, objectKey}
	if apiKeyName != nil {
		metadataFields = append(metadataFields, *apiKeyName)
	}
	for _, field := range metadataFields {
		if snippet := excerptAroundTerms(field, queryTerms, 160); snippet != "" {
			return snippet, "metadata"
		}
	}

	return buildPreferredExcerpt(description, ocrText, objectKey), "document context"
}

func buildPreferredExcerpt(description string, ocrText string, fallback string) string {
	if clipped := clipText(description, 220); clipped != "" {
		return clipped
	}
	if clipped := clipText(ocrText, 220); clipped != "" {
		return clipped
	}
	return clipText(fallback, 220)
}

func buildOCRExcerpts(row documentContextRow) []DocumentOCRExcerpt {
	if strings.TrimSpace(row.OCRText) == "" {
		return []DocumentOCRExcerpt{}
	}

	modelLabel := "OCR result"
	if row.OCRModelLabel != nil && strings.TrimSpace(*row.OCRModelLabel) != "" {
		modelLabel = *row.OCRModelLabel
	}
	createdAt := row.CreatedAt.Format(time.RFC3339)
	if row.OCRCreatedAt != nil {
		createdAt = row.OCRCreatedAt.Format(time.RFC3339)
	}

	return []DocumentOCRExcerpt{
		{
			ModelLabel: modelLabel,
			Excerpt:    clipText(row.OCRText, 420),
			CreatedAt:  createdAt,
		},
	}
}

func buildSegmentationExcerpt(row segmentationContextRow) DocumentSegmentationExcerpt {
	excerpt := buildPreferredExcerpt(row.DescriptionText, row.OCRText, "")
	if excerpt == "" && row.ObjectKey != nil {
		excerpt = clipText(*row.ObjectKey, 220)
	}

	prompt := ""
	if row.Prompt != nil {
		prompt = strings.TrimSpace(*row.Prompt)
	}

	return DocumentSegmentationExcerpt{
		SegmentationID: row.SegmentationID,
		ModelLabel:     row.ModelLabel,
		Prompt:         prompt,
		Excerpt:        excerpt,
		CreatedAt:      row.CreatedAt.Format(time.RFC3339),
	}
}

func buildDocumentLabel(objectKey string, documentID string) string {
	base := strings.TrimSpace(filepath.Base(objectKey))
	if base != "" && base != "." && base != "/" {
		return base
	}
	if len(documentID) >= 8 {
		return fmt.Sprintf("Document %s", documentID[:8])
	}
	return "Document"
}

func excerptAroundTerms(text string, terms []string, maxLen int) string {
	normalized := normalizeWhitespace(text)
	if normalized == "" {
		return ""
	}

	lower := strings.ToLower(normalized)
	firstIndex := -1
	for _, term := range terms {
		if term == "" {
			continue
		}
		index := strings.Index(lower, strings.ToLower(term))
		if index >= 0 && (firstIndex == -1 || index < firstIndex) {
			firstIndex = index
		}
	}
	if firstIndex == -1 {
		return ""
	}

	start := firstIndex - maxLen/3
	if start < 0 {
		start = 0
	}
	end := start + maxLen
	if end > len(normalized) {
		end = len(normalized)
	}
	snippet := strings.TrimSpace(normalized[start:end])
	if start > 0 {
		snippet = "..." + strings.TrimLeft(snippet, ".,;:!? ")
	}
	if end < len(normalized) {
		snippet = strings.TrimRight(snippet, ".,;:!? ") + "..."
	}
	return snippet
}

func clipText(text string, maxLen int) string {
	normalized := normalizeWhitespace(text)
	if normalized == "" {
		return ""
	}
	if len(normalized) <= maxLen {
		return normalized
	}
	return strings.TrimSpace(normalized[:maxLen-3]) + "..."
}

func normalizeWhitespace(text string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
}

func splitTerms(query string) []string {
	parts := strings.Fields(strings.ToLower(query))
	deduped := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		trimmed := strings.Trim(part, "\"'.,;:!?()[]{}")
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		deduped = append(deduped, trimmed)
	}
	return deduped
}
