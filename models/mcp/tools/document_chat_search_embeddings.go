package tools

import (
	"context"
	"fmt"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type missingDescriptionEmbeddingRow struct {
	DocumentDescriptionID string `gorm:"column:document_description_id"`
	Text                  string `gorm:"column:text"`
}

func buildSemanticQueryEmbedding(ctx context.Context, query string) (string, error) {
	semanticQuery := normalizeEmbeddingText(query)
	if semanticQuery == "" {
		return "", nil
	}

	return buildOpenAITextEmbedding(ctx, semanticQuery)
}

func ensureOpenAITextEmbeddingModel(db *gorm.DB) (*dbmodels.Model, error) {
	modelType := "embedding"
	embeddingDim := int32(openAITextEmbeddingDim)
	return ensureModelByIdentity(
		db,
		openAITextEmbeddingProvider,
		openAITextEmbeddingModelName,
		"",
		&modelType,
		&embeddingDim,
	)
}

func ensureLatestDescriptionEmbeddingsInScope(
	ctx context.Context,
	db *gorm.DB,
	scope ChatDocumentScope,
	model *dbmodels.Model,
) error {
	filters, args := buildDocumentScopeFilters("d", scope)
	query := fmt.Sprintf(`
		SELECT
			latest_description.id AS document_description_id,
			latest_description.text
		FROM documents d
		INNER JOIN LATERAL (
			SELECT dd.id, dd.text
			FROM document_descriptions dd
			WHERE dd.document_id = d.id
			ORDER BY dd.created_at DESC
			LIMIT 1
		) latest_description ON TRUE
		LEFT JOIN document_description_embeddings dde
			ON dde.document_description_id = latest_description.id
			AND dde.model_id = ?
			AND dde.embedding_dim = ?
		WHERE NOT EXISTS (
			SELECT 1
			FROM document_segmentations ds_hidden
			WHERE ds_hidden.segmented_document_id = d.id
		)
			AND %s
			AND dde.id IS NULL
		ORDER BY d.created_at DESC
	`, filters)

	var rows []missingDescriptionEmbeddingRow
	queryArgs := append([]any{model.ID, openAITextEmbeddingDim}, args...)
	if err := db.WithContext(ctx).Raw(query, queryArgs...).Scan(&rows).Error; err != nil {
		return fmt.Errorf(
			"search_documents_in_scope missing description embeddings query failed: %w",
			err,
		)
	}
	if len(rows) == 0 {
		return nil
	}

	texts := make([]string, 0, len(rows))
	pendingRows := make([]missingDescriptionEmbeddingRow, 0, len(rows))
	for _, row := range rows {
		normalized := normalizeEmbeddingText(row.Text)
		if normalized == "" {
			continue
		}
		pendingRows = append(pendingRows, row)
		texts = append(texts, normalized)
	}
	if len(pendingRows) == 0 {
		return nil
	}

	embeddings, err := buildOpenAITextEmbeddings(ctx, texts)
	if err != nil {
		return err
	}
	if len(embeddings) != len(pendingRows) {
		return fmt.Errorf(
			"OpenAI embedding count mismatch: expected %d, got %d",
			len(pendingRows),
			len(embeddings),
		)
	}

	records := make([]dbmodels.DocumentDescriptionEmbedding, 0, len(pendingRows))
	for index, row := range pendingRows {
		records = append(records, dbmodels.DocumentDescriptionEmbedding{
			DocumentDescriptionID: row.DocumentDescriptionID,
			ModelID:               model.ID,
			EmbeddingDim:          openAITextEmbeddingDim,
			Embedding:             embeddings[index],
		})
	}

	if err := db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "document_description_id"},
			{Name: "model_id"},
			{Name: "embedding_dim"},
		},
		DoUpdates: clause.AssignmentColumns([]string{"embedding", "updated_at"}),
	}).Create(&records).Error; err != nil {
		return fmt.Errorf("failed to save OpenAI description embeddings: %w", err)
	}

	return nil
}
