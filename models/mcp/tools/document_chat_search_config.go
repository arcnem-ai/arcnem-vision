package tools

import (
	"fmt"
	"os"
	"strings"
)

const defaultDocumentSearchLimit = 5
const maxDocumentSearchLimit = 8
const hybridSearchCandidateFloor = 8
const maxHybridSearchCandidateLimit = 18
const reciprocalRankFusionOffset = 50.0
const lexicalSearchWeight = 1.25
const descriptionSemanticSearchWeight = 1.0

type documentSearchMode string

const (
	documentSearchModeHybrid  documentSearchMode = "hybrid"
	documentSearchModeLexical documentSearchMode = "lexical"
)

type documentSearchCandidate struct {
	Row                documentSearchRow
	DefaultMatchReason string
}

type documentSearchSignalSet struct {
	Rows               []documentSearchRow
	DefaultMatchReason string
	Weight             float64
}

func resolveDocumentSearchMode(raw string) (documentSearchMode, error) {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	if normalized == "" {
		return documentSearchModeHybrid, nil
	}

	switch documentSearchMode(normalized) {
	case documentSearchModeHybrid, documentSearchModeLexical:
		return documentSearchMode(normalized), nil
	default:
		return "", fmt.Errorf(
			"invalid DOCUMENT_SEARCH_MODE %q: expected hybrid or lexical",
			raw,
		)
	}
}

func loadDocumentSearchMode() (documentSearchMode, error) {
	return resolveDocumentSearchMode(os.Getenv("DOCUMENT_SEARCH_MODE"))
}

func ValidateDocumentSearchConfig() error {
	_, err := loadDocumentSearchMode()
	return err
}
