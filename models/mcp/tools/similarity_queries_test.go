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
	}

	for _, fragment := range requiredFragments {
		if !strings.Contains(query, fragment) {
			t.Fatalf("expected query to contain %q, got:\n%s", fragment, query)
		}
	}
}
