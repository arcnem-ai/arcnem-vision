package tools

import (
	"context"
	"fmt"

	"gorm.io/gorm"
)

func readDocumentContext(ctx context.Context, db *gorm.DB, input ReadDocumentContextInput) ([]DocumentContextItem, error) {
	scope, ok := buildDocumentContextScope(input)
	if !ok {
		return []DocumentContextItem{}, nil
	}

	rows, err := loadDocumentContextRows(ctx, db, scope)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []DocumentContextItem{}, nil
	}

	segmentationRows, err := loadSegmentationContext(ctx, db, rows)
	if err != nil {
		return nil, err
	}

	return buildDocumentContextItems(rows, segmentationRows), nil
}

func buildDocumentContextScope(input ReadDocumentContextInput) (ChatDocumentScope, bool) {
	documentIDs := dedupeNonEmpty(input.DocumentIDs)
	if len(documentIDs) == 0 {
		return ChatDocumentScope{}, false
	}

	scope := input.Scope
	scope.DocumentIDs = intersectDocumentIDs(scope.DocumentIDs, documentIDs)
	if len(scope.DocumentIDs) == 0 {
		scope.DocumentIDs = documentIDs
	}

	return scope, true
}

func loadDocumentContextRows(
	ctx context.Context,
	db *gorm.DB,
	scope ChatDocumentScope,
) ([]documentContextRow, error) {
	filters, args := buildDocumentScopeFilters("d", scope)
	query := fmt.Sprintf(`
		SELECT
			d.id AS document_id,
			d.object_key,
			d.project_id,
			p.name AS project_name,
			d.device_id,
			dev.name AS device_name,
			COALESCE(latest_description.text, '') AS description_text,
			COALESCE(latest_ocr.text, '') AS ocr_text,
			latest_ocr.created_at AS ocr_created_at,
			latest_ocr.model_label AS ocr_model_label,
			d.created_at
		FROM documents d
		INNER JOIN projects p ON p.id = d.project_id
		LEFT JOIN devices dev ON dev.id = d.device_id
		LEFT JOIN LATERAL (
			SELECT dd.text
			FROM document_descriptions dd
			WHERE dd.document_id = d.id
			ORDER BY dd.created_at DESC
			LIMIT 1
		) latest_description ON TRUE
		LEFT JOIN LATERAL (
			SELECT
				dor.text,
				dor.created_at,
				TRIM(BOTH ' /' FROM COALESCE(m.provider, '') || ' / ' || COALESCE(m.name, '')) AS model_label
			FROM document_ocr_results dor
			LEFT JOIN models m ON m.id = dor.model_id
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
	`, filters)

	var rows []documentContextRow
	if err := db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("read_document_context documents query failed: %w", err)
	}

	return rows, nil
}

func buildDocumentContextItems(
	rows []documentContextRow,
	segmentationRows []segmentationContextRow,
) []DocumentContextItem {
	segmentationBySource := map[string][]DocumentSegmentationExcerpt{}
	for _, row := range segmentationRows {
		segmentationBySource[row.SourceDocumentID] = append(
			segmentationBySource[row.SourceDocumentID],
			buildSegmentationExcerpt(row),
		)
	}

	documents := make([]DocumentContextItem, 0, len(rows))
	for _, row := range rows {
		label := buildDocumentLabel(row.ObjectKey, row.DocumentID)
		description := clipText(row.DescriptionText, 420)
		ocrExcerpts := buildOCRExcerpts(row)
		citationExcerpt := buildPreferredExcerpt(row.DescriptionText, row.OCRText, row.ObjectKey)

		documents = append(documents, DocumentContextItem{
			DocumentID:           row.DocumentID,
			ProjectID:            row.ProjectID,
			ProjectName:          row.ProjectName,
			DeviceID:             row.DeviceID,
			DeviceName:           row.DeviceName,
			Label:                label,
			Description:          description,
			OCRExcerpts:          ocrExcerpts,
			SegmentationExcerpts: segmentationBySource[row.DocumentID],
			Citation: DocumentChatCitation{
				DocumentID:  row.DocumentID,
				ProjectID:   row.ProjectID,
				ProjectName: row.ProjectName,
				DeviceID:    row.DeviceID,
				DeviceName:  row.DeviceName,
				Label:       label,
				Excerpt:     citationExcerpt,
				MatchReason: "document context",
			},
		})
	}

	return documents
}

func loadSegmentationContext(ctx context.Context, db *gorm.DB, rows []documentContextRow) ([]segmentationContextRow, error) {
	sourceDocumentIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		sourceDocumentIDs = append(sourceDocumentIDs, row.DocumentID)
	}

	var segmentationRows []segmentationContextRow
	err := db.WithContext(ctx).Raw(`
		SELECT
			ds.source_document_id,
			ds.id AS segmentation_id,
			COALESCE(ds.input ->> 'prompt', '') AS prompt,
			ds.created_at,
			TRIM(BOTH ' /' FROM COALESCE(m.provider, '') || ' / ' || COALESCE(m.name, '')) AS model_label,
			COALESCE(seg_description.text, '') AS description_text,
			COALESCE(seg_ocr.text, '') AS ocr_text,
			segmented_document.object_key
		FROM document_segmentations ds
		LEFT JOIN models m ON m.id = ds.model_id
		LEFT JOIN documents segmented_document ON segmented_document.id = ds.segmented_document_id
		LEFT JOIN LATERAL (
			SELECT dd.text
			FROM document_descriptions dd
			WHERE dd.document_id = ds.segmented_document_id
			ORDER BY dd.created_at DESC
			LIMIT 1
		) seg_description ON TRUE
		LEFT JOIN LATERAL (
			SELECT dor.text
			FROM document_ocr_results dor
			WHERE dor.document_id = ds.segmented_document_id
			ORDER BY dor.created_at DESC
			LIMIT 1
		) seg_ocr ON TRUE
		WHERE ds.source_document_id IN ?
		ORDER BY ds.created_at DESC
	`, sourceDocumentIDs).Scan(&segmentationRows).Error
	if err != nil {
		return nil, fmt.Errorf("read_document_context segmentation query failed: %w", err)
	}

	return segmentationRows, nil
}
