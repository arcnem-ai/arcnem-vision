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
}

type CreateDocumentDescriptionOutput struct {
	DescriptionID string `json:"description_id"`
	Text          string `json:"text"`
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
