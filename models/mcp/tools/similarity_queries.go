package tools

import (
	"context"
	"fmt"

	"gorm.io/gorm"
)

const defaultFindSimilarLimit = 5

func buildEmbeddingSimilarityQuery(tableName, idColumn string) string {
	return fmt.Sprintf(`
		SELECT target.%s AS id, target.embedding <=> source.embedding AS distance
		FROM %s source
		JOIN %s target
			ON target.model_id = source.model_id
			AND target.embedding_dim = source.embedding_dim
			AND target.%s != source.%s
		WHERE source.%s = ?
		ORDER BY distance
		LIMIT ?
	`, idColumn, tableName, tableName, idColumn, idColumn, idColumn)
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
