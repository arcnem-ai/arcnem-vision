package inputs

import "github.com/google/uuid"

type ProcessDocumentUploadInput struct {
	DocumentID uuid.UUID `json:"document_id"`
}
