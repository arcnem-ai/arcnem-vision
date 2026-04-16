package tools

import (
	"context"
	"fmt"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"gorm.io/gorm"
)

func runRecentDocumentBrowse(
	ctx context.Context,
	db *gorm.DB,
	scope ChatDocumentScope,
	limit int,
) ([]documentSearchRow, error) {
	filters, args := buildDocumentScopeFilters("d", scope)
	query := fmt.Sprintf(`
		SELECT
			d.id AS document_id,
			d.object_key,
			d.content_type,
			d.size_bytes,
			d.project_id,
			p.name AS project_name,
			d.api_key_id,
			ak.name AS api_key_name,
			COALESCE(latest_description.text, '') AS description_text,
			COALESCE(latest_ocr.text, '') AS ocr_text,
			EXTRACT(EPOCH FROM d.created_at)::float8 AS score,
			d.created_at
		FROM documents d
		INNER JOIN projects p ON p.id = d.project_id
		LEFT JOIN apikeys ak ON ak.id = d.api_key_id
		LEFT JOIN LATERAL (
			SELECT dd.text
			FROM document_descriptions dd
			WHERE dd.document_id = d.id
			ORDER BY dd.created_at DESC
			LIMIT 1
		) latest_description ON TRUE
		LEFT JOIN LATERAL (
			SELECT dor.text
			FROM document_ocr_results dor
			WHERE dor.document_id = d.id
			ORDER BY dor.created_at DESC
			LIMIT 1
		) latest_ocr ON TRUE
		WHERE NOT EXISTS (
			SELECT 1
			FROM document_segmentations ds_hidden
			WHERE ds_hidden.segmented_document_id = d.id
		)
			AND %s
		ORDER BY d.created_at DESC
		LIMIT ?
	`, filters)

	var rows []documentSearchRow
	queryArgs := append(args, limit)
	if err := db.WithContext(ctx).Raw(query, queryArgs...).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("browse_documents_in_scope query failed: %w", err)
	}

	return rows, nil
}

func runLexicalDocumentSearch(
	ctx context.Context,
	db *gorm.DB,
	scope ChatDocumentScope,
	normalizedQuery string,
	limit int,
) ([]documentSearchRow, error) {
	filters, args := buildDocumentScopeFilters("d", scope)
	searchableText := `
		COALESCE(latest_description.text, '') || ' ' ||
		COALESCE(latest_ocr.text, '') || ' ' ||
		COALESCE(d.object_key, '') || ' ' ||
		COALESCE(p.name, '') || ' ' ||
		COALESCE(ak.name, '')
	`

	query := fmt.Sprintf(`
		SELECT
			d.id AS document_id,
			d.object_key,
			d.content_type,
			d.size_bytes,
			d.project_id,
			p.name AS project_name,
			d.api_key_id,
			ak.name AS api_key_name,
			COALESCE(latest_description.text, '') AS description_text,
			COALESCE(latest_ocr.text, '') AS ocr_text,
			GREATEST(
				ts_rank_cd(
					to_tsvector('english', %s),
					websearch_to_tsquery('english', ?)
				),
				ts_rank_cd(
					to_tsvector('simple', %s),
					websearch_to_tsquery('simple', ?)
				)
			) AS score,
			d.created_at
		FROM documents d
		INNER JOIN projects p ON p.id = d.project_id
		LEFT JOIN apikeys ak ON ak.id = d.api_key_id
		LEFT JOIN LATERAL (
			SELECT dd.id, dd.text
			FROM document_descriptions dd
			WHERE dd.document_id = d.id
			ORDER BY dd.created_at DESC
			LIMIT 1
		) latest_description ON TRUE
		LEFT JOIN LATERAL (
			SELECT dor.text
			FROM document_ocr_results dor
			WHERE dor.document_id = d.id
			ORDER BY dor.created_at DESC
			LIMIT 1
		) latest_ocr ON TRUE
		WHERE NOT EXISTS (
			SELECT 1
			FROM document_segmentations ds_hidden
			WHERE ds_hidden.segmented_document_id = d.id
		)
			AND %s
			AND (
				to_tsvector('english', %s) @@ websearch_to_tsquery('english', ?)
				OR to_tsvector('simple', %s) @@ websearch_to_tsquery('simple', ?)
			)
		ORDER BY score DESC, d.created_at DESC
		LIMIT ?
	`, searchableText, searchableText, filters, searchableText, searchableText)

	var rows []documentSearchRow
	queryArgs := append([]any{normalizedQuery, normalizedQuery}, args...)
	queryArgs = append(queryArgs, normalizedQuery, normalizedQuery, limit)
	if err := db.WithContext(ctx).Raw(query, queryArgs...).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("search_documents_in_scope lexical query failed: %w", err)
	}

	return rows, nil
}

func runDescriptionSemanticSearch(
	ctx context.Context,
	db *gorm.DB,
	scope ChatDocumentScope,
	queryEmbedding string,
	model *dbmodels.Model,
	limit int,
) ([]documentSearchRow, error) {
	filters, args := buildDocumentScopeFilters("d", scope)
	query := fmt.Sprintf(`
		SELECT
			d.id AS document_id,
			d.object_key,
			d.content_type,
			d.size_bytes,
			d.project_id,
			p.name AS project_name,
			d.api_key_id,
			ak.name AS api_key_name,
			COALESCE(latest_description.text, '') AS description_text,
			COALESCE(latest_ocr.text, '') AS ocr_text,
			GREATEST(0.0, 1 - (dde.embedding <=> ?::vector)) AS score,
			d.created_at
		FROM documents d
		INNER JOIN projects p ON p.id = d.project_id
		LEFT JOIN apikeys ak ON ak.id = d.api_key_id
		LEFT JOIN LATERAL (
			SELECT dd.id, dd.text
			FROM document_descriptions dd
			WHERE dd.document_id = d.id
			ORDER BY dd.created_at DESC
			LIMIT 1
		) latest_description ON TRUE
		INNER JOIN document_description_embeddings dde
			ON dde.document_description_id = latest_description.id
			AND dde.model_id = ?
			AND dde.embedding_dim = ?
		LEFT JOIN LATERAL (
			SELECT dor.text
			FROM document_ocr_results dor
			WHERE dor.document_id = d.id
			ORDER BY dor.created_at DESC
			LIMIT 1
		) latest_ocr ON TRUE
		WHERE NOT EXISTS (
			SELECT 1
			FROM document_segmentations ds_hidden
			WHERE ds_hidden.segmented_document_id = d.id
		)
			AND %s
		ORDER BY dde.embedding <=> ?::vector ASC, d.created_at DESC
		LIMIT ?
	`, filters)

	var rows []documentSearchRow
	queryArgs := []any{queryEmbedding, model.ID, openAITextEmbeddingDim}
	queryArgs = append(queryArgs, args...)
	queryArgs = append(queryArgs, queryEmbedding, limit)
	if err := db.WithContext(ctx).Raw(query, queryArgs...).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf(
			"search_documents_in_scope description semantic query failed: %w",
			err,
		)
	}

	return rows, nil
}
