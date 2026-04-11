package tools

import (
	"context"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

func searchDocumentsInScope(ctx context.Context, db *gorm.DB, input SearchDocumentsInScopeInput) ([]DocumentSearchMatch, error) {
	normalizedQuery := strings.TrimSpace(input.Query)
	if normalizedQuery == "" {
		return []DocumentSearchMatch{}, nil
	}

	limit := clampSearchLimit(input.Limit)
	candidateLimit := expandedDocumentSearchLimit(limit)
	signalSets := make([]documentSearchSignalSet, 0, 2)
	searchMode, err := loadDocumentSearchMode()
	if err != nil {
		return nil, err
	}

	lexicalRows, err := runLexicalDocumentSearch(
		ctx,
		db,
		input.Scope,
		normalizedQuery,
		candidateLimit,
	)
	if err != nil {
		return nil, err
	}
	if len(lexicalRows) > 0 {
		signalSets = append(signalSets, documentSearchSignalSet{
			Rows:               lexicalRows,
			DefaultMatchReason: "",
			Weight:             lexicalSearchWeight,
		})
	}

	if searchMode == documentSearchModeHybrid {
		semanticSignalSet, semanticErr := buildDescriptionSemanticSignalSet(
			ctx,
			db,
			input.Scope,
			normalizedQuery,
			candidateLimit,
		)
		if semanticErr != nil {
			return nil, fmt.Errorf(
				"search_documents_in_scope semantic pipeline unavailable in hybrid mode: %w",
				semanticErr,
			)
		}
		if semanticSignalSet != nil {
			signalSets = append(signalSets, *semanticSignalSet)
		}
	}

	if len(signalSets) == 0 {
		return []DocumentSearchMatch{}, nil
	}

	fusedCandidates := fuseDocumentSearchSignalSets(signalSets, limit)
	return buildDocumentSearchMatchesFromCandidates(
		fusedCandidates,
		normalizedQuery,
	), nil
}

func browseDocumentsInScope(ctx context.Context, db *gorm.DB, input BrowseDocumentsInScopeInput) ([]DocumentSearchMatch, error) {
	limit := clampSearchLimit(input.Limit)
	rows, err := runRecentDocumentBrowse(ctx, db, input.Scope, limit)
	if err != nil {
		return nil, err
	}

	return buildDocumentSearchMatches(rows, "", "recent document"), nil
}

func clampSearchLimit(limit int) int {
	if limit <= 0 {
		return defaultDocumentSearchLimit
	}
	if limit > maxDocumentSearchLimit {
		return maxDocumentSearchLimit
	}
	return limit
}

func buildDescriptionSemanticSignalSet(
	ctx context.Context,
	db *gorm.DB,
	scope ChatDocumentScope,
	normalizedQuery string,
	candidateLimit int,
) (*documentSearchSignalSet, error) {
	queryEmbedding, err := buildSemanticQueryEmbedding(ctx, normalizedQuery)
	if err != nil {
		return nil, err
	}
	if queryEmbedding == "" {
		return nil, nil
	}

	model, err := ensureOpenAITextEmbeddingModel(db)
	if err != nil {
		return nil, err
	}
	if err := ensureLatestDescriptionEmbeddingsInScope(ctx, db, scope, model); err != nil {
		return nil, err
	}

	rows, err := runDescriptionSemanticSearch(
		ctx,
		db,
		scope,
		queryEmbedding,
		model,
		candidateLimit,
	)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	return &documentSearchSignalSet{
		Rows:               rows,
		DefaultMatchReason: "semantic description match",
		Weight:             descriptionSemanticSearchWeight,
	}, nil
}
