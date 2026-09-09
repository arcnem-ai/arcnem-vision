package tools

import (
	"strings"
	"testing"
)

func TestBuildEmbeddingSimilarityQueryConstrainsModelAndDimension(t *testing.T) {
	query := buildEmbeddingSimilarityQuery(
		"document_description_embeddings",
		"document_description_id",
	)

	requiredFragments := []string{
		"FROM document_description_embeddings source",
		"JOIN document_description_embeddings target",
		"target.model_id = source.model_id",
		"target.embedding_dim = source.embedding_dim",
		"target.document_description_id != source.document_description_id",
		"WHERE source.document_description_id = ?",
		"JOIN documents source_document ON source_document.id = source_description.document_id",
		"JOIN documents target_document ON target_document.id = target_description.document_id",
		"target_document.organization_id = source_document.organization_id",
		"target_document.project_id = source_document.project_id",
	}

	for _, fragment := range requiredFragments {
		if !strings.Contains(query, fragment) {
			t.Fatalf("expected query to contain %q, got:\n%s", fragment, query)
		}
	}
}

func TestImageSimilarityStaysWithinSourceProject(t *testing.T) {
	query := buildEmbeddingSimilarityQuery("document_embeddings", "document_id")
	for _, fragment := range []string{
		"JOIN documents source_document ON source_document.id = source.document_id",
		"JOIN documents target_document ON target_document.id = target.document_id",
		"target_document.organization_id = source_document.organization_id",
		"target_document.project_id = source_document.project_id",
	} {
		if !strings.Contains(query, fragment) {
			t.Fatalf("query missing %q", fragment)
		}
	}
}
