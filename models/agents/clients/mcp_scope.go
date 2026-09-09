package clients

import (
	"context"
	"fmt"
	"maps"
	"time"

	"gorm.io/gorm"
)

type mcpScopeKey struct{}

type mcpExecutionScope struct {
	db             *gorm.DB
	s3             *S3Client
	organizationID string
	projectID      string
	documentIDs    []string
}

// ContextWithMCPExecutionScope takes the persisted documents loaded for a run,
// never graph state or model-generated arguments. Tool calls fail closed without it.
func ContextWithMCPExecutionScope(ctx context.Context, db *gorm.DB, s3 *S3Client, organizationID, projectID string, documentIDs []string) context.Context {
	return context.WithValue(ctx, mcpScopeKey{}, mcpExecutionScope{
		db: db, s3: s3, organizationID: organizationID, projectID: projectID,
		documentIDs: append([]string(nil), documentIDs...),
	})
}

type authorizedMCPDocument struct {
	DocumentID    string  `gorm:"column:document_id"`
	DescriptionID *string `gorm:"column:description_id"`
	Bucket        string  `gorm:"column:bucket"`
	ObjectKey     string  `gorm:"column:object_key"`
}

// UNION also terminates if malformed persisted segmentation links contain a cycle.
const authorizedMCPDocumentsQuery = `
	WITH RECURSIVE allowed_documents AS (
		SELECT id FROM documents WHERE id IN ? AND organization_id = ? AND project_id = ?
		UNION
		SELECT child.id FROM document_segmentations segmentation
		JOIN allowed_documents parent ON parent.id = segmentation.source_document_id
		JOIN documents child ON child.id = segmentation.segmented_document_id
		WHERE child.organization_id = ? AND child.project_id = ?
	)
	SELECT allowed.id AS document_id, description.id AS description_id, document.bucket, document.object_key
	FROM allowed_documents allowed
	JOIN documents document ON document.id = allowed.id
	LEFT JOIN document_descriptions description ON description.document_id = allowed.id
`

func authorizeMCPToolCall(ctx context.Context, toolName string, args map[string]any) (map[string]any, error) {
	scope, ok := ctx.Value(mcpScopeKey{}).(mcpExecutionScope)
	if !ok || scope.db == nil || scope.organizationID == "" || scope.projectID == "" || len(scope.documentIDs) == 0 {
		return nil, fmt.Errorf("MCP tool call requires a trusted workflow execution scope")
	}
	var rows []authorizedMCPDocument
	if err := scope.db.WithContext(ctx).Raw(authorizedMCPDocumentsQuery,
		scope.documentIDs, scope.organizationID, scope.projectID, scope.organizationID, scope.projectID,
	).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("load MCP execution scope: %w", err)
	}
	allowedDocuments := make(map[string]bool, len(rows))
	allowedDescriptions := make(map[string]bool, len(rows))
	documentsByID := make(map[string]authorizedMCPDocument, len(rows))
	for _, row := range rows {
		allowedDocuments[row.DocumentID] = true
		documentsByID[row.DocumentID] = row
		if row.DescriptionID != nil {
			allowedDescriptions[*row.DescriptionID] = true
		}
	}
	if len(allowedDocuments) == 0 {
		return nil, fmt.Errorf("workflow has no accessible documents")
	}

	guarded := maps.Clone(args)
	if guarded == nil {
		guarded = make(map[string]any)
	}
	requireID := func(field string, allowed map[string]bool) error {
		id, ok := guarded[field].(string)
		if !ok || !allowed[id] {
			return fmt.Errorf("MCP argument %s is outside the workflow document selection", field)
		}
		return nil
	}
	var requiredField string
	switch toolName {
	case "create_document_embedding", "create_document_description", "create_document_segmentation", "create_document_ocr", "find_similar_documents":
		requiredField = "document_id"
		if err := requireID(requiredField, allowedDocuments); err != nil {
			return nil, err
		}
	case "create_description_embedding", "find_similar_descriptions":
		requiredField = "document_description_id"
		if err := requireID(requiredField, allowedDescriptions); err != nil {
			return nil, err
		}
	case "search_documents_in_scope", "browse_documents_in_scope", "read_document_context":
		documentIDs := append([]string(nil), scope.documentIDs...)
		if requested, ok := guarded["scope"].(map[string]any); ok && requested["document_ids"] != nil {
			ids, err := authorizedMCPIDs(requested["document_ids"], allowedDocuments)
			if err != nil {
				return nil, err
			}
			if len(ids) > 0 {
				documentIDs = ids
			}
		}
		if toolName == "read_document_context" {
			ids, err := authorizedMCPIDs(guarded["document_ids"], allowedDocuments)
			if err != nil {
				return nil, err
			}
			if len(ids) == 0 {
				return nil, fmt.Errorf("read_document_context requires document_ids")
			}
			guarded["document_ids"] = ids
			// Use the validated request as the scope as well, so a caller-supplied
			// non-overlapping scope cannot activate the internal reader's fallback.
			documentIDs = ids
		}
		guarded["scope"] = map[string]any{
			"organization_id": scope.organizationID,
			"project_ids":     []string{scope.projectID},
			"document_ids":    documentIDs,
		}
	default:
		return nil, fmt.Errorf("MCP tool %q has no workflow authorization rule", toolName)
	}
	if toolName == "create_document_embedding" || toolName == "create_document_ocr" || toolName == "create_document_segmentation" {
		if scope.s3 == nil {
			return nil, fmt.Errorf("image tool requires trusted storage configuration")
		}
		document := documentsByID[guarded["document_id"].(string)]
		// The image source must match the authorized document, not a URL supplied
		// by graph configuration, initial state, or model output.
		url, err := scope.s3.PresignDownload(ctx, document.Bucket, document.ObjectKey, 15*time.Minute)
		if err != nil {
			return nil, fmt.Errorf("prepare authorized document URL: %w", err)
		}
		guarded["temp_url"] = url
	}
	return guarded, nil
}

func authorizedMCPIDs(value any, allowed map[string]bool) ([]string, error) {
	var ids []string
	switch values := value.(type) {
	case []string:
		ids = values
	case []any:
		for _, value := range values {
			id, ok := value.(string)
			if !ok {
				return nil, fmt.Errorf("document_ids must contain document IDs")
			}
			ids = append(ids, id)
		}
	default:
		return nil, fmt.Errorf("document_ids must be an array")
	}
	for _, id := range ids {
		if !allowed[id] {
			return nil, fmt.Errorf("document_ids contains a document outside the workflow selection")
		}
	}
	return append([]string(nil), ids...), nil
}
