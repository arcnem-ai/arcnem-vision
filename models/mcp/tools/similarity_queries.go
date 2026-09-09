package tools

import (
	"context"
	"fmt"

	"gorm.io/gorm"
)

const defaultFindSimilarLimit = 5

func buildEmbeddingSimilarityQuery(tableName, idColumn string) string {
	sourceOwner := "JOIN documents source_document ON source_document.id = source.document_id"
	targetOwner := "JOIN documents target_document ON target_document.id = target.document_id"
	if idColumn == "document_description_id" {
		sourceOwner = "JOIN document_descriptions source_description ON source_description.id = source.document_description_id JOIN documents source_document ON source_document.id = source_description.document_id"
		targetOwner = "JOIN document_descriptions target_description ON target_description.id = target.document_description_id JOIN documents target_document ON target_document.id = target_description.document_id"
	}
	return fmt.Sprintf(`
		SELECT target.%s AS id, target.embedding <=> source.embedding AS distance
		FROM %s source
		JOIN %s target
			ON target.model_id = source.model_id
			AND target.embedding_dim = source.embedding_dim
			AND target.%s != source.%s
		%s
		%s
		WHERE source.%s = ?
			AND target_document.organization_id = source_document.organization_id
			AND target_document.project_id = source_document.project_id
		ORDER BY distance
		LIMIT ?
	`, idColumn, tableName, tableName, idColumn, idColumn, sourceOwner, targetOwner, idColumn)
}

func runFindSimilarEmbeddings(
	ctx context.Context,
	db *gorm.DB,
	tableName string,
	idColumn string,
	sourceID string,
	limit int,
) ([]SimilarMatch, error) {
	var results []SimilarMatch
	query := buildEmbeddingSimilarityQuery(tableName, idColumn)

	if err := db.WithContext(ctx).Raw(query, sourceID, limit).Scan(&results).Error; err != nil {
		return nil, fmt.Errorf("similarity query failed: %w", err)
	}

	return results, nil
}
