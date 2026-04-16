package tools

import (
	"testing"
	"time"
)

func TestBuildDocumentSearchMatchesIncludesDocumentMetadata(t *testing.T) {
	createdAt := time.Date(2026, time.April, 6, 12, 0, 0, 0, time.UTC)
	apiKeyID := "key-123"
	apiKeyName := "Dock 3 workflow key"

	matches := buildDocumentSearchMatches(
		[]documentSearchRow{
			{
				DocumentID:      "doc-123",
				ObjectKey:       "uploads/seed/sharp-puppy.jpg",
				ContentType:     "image/jpeg",
				SizeBytes:       4096,
				ProjectID:       "project-123",
				ProjectName:     "Seed Project",
				APIKeyID:        &apiKeyID,
				APIKeyName:      &apiKeyName,
				DescriptionText: "A black dog standing on a path in bright sunlight.",
				CreatedAt:       createdAt,
				Score:           0.42,
			},
		},
		"black dog",
		"",
	)

	if len(matches) != 1 {
		t.Fatalf("expected exactly one match, got %d", len(matches))
	}

	match := matches[0]
	if match.ObjectKey != "uploads/seed/sharp-puppy.jpg" {
		t.Fatalf("expected object key to be preserved, got %q", match.ObjectKey)
	}
	if match.ContentType != "image/jpeg" {
		t.Fatalf("expected content type to be preserved, got %q", match.ContentType)
	}
	if match.SizeBytes != 4096 {
		t.Fatalf("expected size bytes to be preserved, got %d", match.SizeBytes)
	}
	if match.CreatedAt != createdAt.Format(time.RFC3339) {
		t.Fatalf("expected createdAt %q, got %q", createdAt.Format(time.RFC3339), match.CreatedAt)
	}
	if match.Citation.Label != "sharp-puppy.jpg" {
		t.Fatalf("expected citation label to use object key basename, got %q", match.Citation.Label)
	}
}

func TestMergeDocumentSearchRowsKeepsAvailableMetadata(t *testing.T) {
	current := documentSearchRow{
		DocumentID: "doc-123",
		ObjectKey:  "uploads/seed/sharp-puppy.jpg",
		CreatedAt:  time.Date(2026, time.April, 6, 9, 0, 0, 0, time.UTC),
	}
	incoming := documentSearchRow{
		DocumentID:  "doc-123",
		ContentType: "image/jpeg",
		SizeBytes:   5120,
		ProjectID:   "project-123",
		ProjectName: "Seed Project",
		CreatedAt:   time.Date(2026, time.April, 6, 10, 0, 0, 0, time.UTC),
	}

	merged := mergeDocumentSearchRows(current, incoming)

	if merged.ContentType != "image/jpeg" {
		t.Fatalf("expected content type to be merged, got %q", merged.ContentType)
	}
	if merged.SizeBytes != 5120 {
		t.Fatalf("expected size bytes to be merged, got %d", merged.SizeBytes)
	}
	if merged.ProjectID != "project-123" {
		t.Fatalf("expected project ID to be merged, got %q", merged.ProjectID)
	}
	if !merged.CreatedAt.Equal(incoming.CreatedAt) {
		t.Fatalf("expected newer createdAt to win, got %s", merged.CreatedAt)
	}
}
