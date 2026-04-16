package tools

type CreateDocumentEmbeddingInput struct {
	DocumentID string `json:"document_id"`
	TempURL    string `json:"temp_url"`
}

type CreateDocumentEmbeddingOutput struct {
	EmbeddingID string `json:"embedding_id"`
}

type CreateDescriptionEmbeddingInput struct {
	DocumentDescriptionID string `json:"document_description_id"`
	Text                  string `json:"text"`
}

type CreateDescriptionEmbeddingOutput struct {
	EmbeddingID string `json:"embedding_id"`
}

type CreateDocumentDescriptionInput struct {
	DocumentID    string `json:"document_id"`
	Text          string `json:"text"`
	ModelProvider string `json:"model_provider"`
	ModelName     string `json:"model_name"`
	ModelVersion  string `json:"model_version"`
}

type CreateDocumentDescriptionOutput struct {
	DescriptionID string `json:"description_id"`
	Text          string `json:"text"`
}

type CreateDocumentSegmentationInput struct {
	DocumentID    string         `json:"document_id"`
	TempURL       string         `json:"temp_url"`
	ModelProvider string         `json:"model_provider"`
	ModelName     string         `json:"model_name"`
	ModelVersion  string         `json:"model_version"`
	InputParams   map[string]any `json:"input_params,omitempty"`
}

type CreateDocumentSegmentationOutput struct {
	SegmentationID      string `json:"segmentation_id"`
	SegmentedDocumentID string `json:"segmented_document_id,omitempty"`
	SegmentedTempURL    string `json:"segmented_temp_url,omitempty"`
	Result              any    `json:"result"`
}

type CreateDocumentOCRInput struct {
	DocumentID    string         `json:"document_id"`
	TempURL       string         `json:"temp_url"`
	ModelProvider string         `json:"model_provider"`
	ModelName     string         `json:"model_name"`
	ModelVersion  string         `json:"model_version"`
	InputParams   map[string]any `json:"input_params,omitempty"`
}

type CreateDocumentOCROutput struct {
	OCRResultID   string `json:"ocr_result_id"`
	Text          string `json:"text"`
	AvgConfidence *int   `json:"avg_confidence,omitempty"`
	Result        any    `json:"result"`
}

type FindSimilarDocumentsInput struct {
	DocumentID string `json:"document_id"`
}

type FindSimilarDescriptionsInput struct {
	DocumentDescriptionID string `json:"document_description_id"`
}

type FindSimilarOutput struct {
	Matches []SimilarMatch `json:"matches"`
}

type SimilarMatch struct {
	ID       string  `json:"id"`
	Distance float64 `json:"distance"`
}

type ChatDocumentScope struct {
	OrganizationID       string   `json:"organization_id"`
	ProjectIDs           []string `json:"project_ids,omitempty"`
	APIKeyIDs            []string `json:"api_key_ids,omitempty"`
	DocumentIDs          []string `json:"document_ids,omitempty"`
	DashboardUploadsOnly bool     `json:"dashboard_uploads_only,omitempty"`
}

type SearchDocumentsInScopeInput struct {
	Query string            `json:"query"`
	Limit int               `json:"limit,omitempty"`
	Scope ChatDocumentScope `json:"scope"`
}

type BrowseDocumentsInScopeInput struct {
	Limit int               `json:"limit,omitempty"`
	Scope ChatDocumentScope `json:"scope"`
}

type DocumentChatCitation struct {
	DocumentID  string  `json:"documentId"`
	ProjectID   string  `json:"projectId"`
	ProjectName string  `json:"projectName"`
	APIKeyID    *string `json:"apiKeyId,omitempty"`
	APIKeyName  *string `json:"apiKeyName,omitempty"`
	Label       string  `json:"label"`
	Excerpt     string  `json:"excerpt"`
	MatchReason string  `json:"matchReason"`
}

type DocumentSearchMatch struct {
	DocumentID  string               `json:"documentId"`
	ObjectKey   string               `json:"objectKey"`
	ContentType string               `json:"contentType"`
	SizeBytes   int64                `json:"sizeBytes"`
	CreatedAt   string               `json:"createdAt"`
	ProjectID   string               `json:"projectId"`
	ProjectName string               `json:"projectName"`
	APIKeyID    *string              `json:"apiKeyId,omitempty"`
	APIKeyName  *string              `json:"apiKeyName,omitempty"`
	Label       string               `json:"label"`
	Snippet     string               `json:"snippet"`
	MatchReason string               `json:"matchReason"`
	Score       float64              `json:"score"`
	Citation    DocumentChatCitation `json:"citation"`
}

type SearchDocumentsInScopeOutput struct {
	Matches []DocumentSearchMatch `json:"matches"`
}

type ReadDocumentContextInput struct {
	DocumentIDs []string          `json:"document_ids"`
	Scope       ChatDocumentScope `json:"scope"`
}

type DocumentOCRExcerpt struct {
	ModelLabel string `json:"modelLabel"`
	Excerpt    string `json:"excerpt"`
	CreatedAt  string `json:"createdAt"`
}

type DocumentSegmentationExcerpt struct {
	SegmentationID string `json:"segmentationId"`
	ModelLabel     string `json:"modelLabel"`
	Prompt         string `json:"prompt,omitempty"`
	Excerpt        string `json:"excerpt"`
	CreatedAt      string `json:"createdAt"`
}

type DocumentContextItem struct {
	DocumentID           string                        `json:"documentId"`
	ProjectID            string                        `json:"projectId"`
	ProjectName          string                        `json:"projectName"`
	APIKeyID             *string                       `json:"apiKeyId,omitempty"`
	APIKeyName           *string                       `json:"apiKeyName,omitempty"`
	Label                string                        `json:"label"`
	Description          string                        `json:"description,omitempty"`
	OCRExcerpts          []DocumentOCRExcerpt          `json:"ocrExcerpts,omitempty"`
	SegmentationExcerpts []DocumentSegmentationExcerpt `json:"segmentationExcerpts,omitempty"`
	Citation             DocumentChatCitation          `json:"citation"`
}

type ReadDocumentContextOutput struct {
	Documents []DocumentContextItem `json:"documents"`
}
