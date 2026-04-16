package tools

import (
	"strings"
	"testing"
)

func TestBuildDocumentScopeFiltersIncludesDashboardUploadsOnly(t *testing.T) {
	filters, args := buildDocumentScopeFilters("d", ChatDocumentScope{
		OrganizationID:       "org-1",
		ProjectIDs:           []string{"project-1"},
		DashboardUploadsOnly: true,
	})

	if !strings.Contains(filters, "d.organization_id = ?") {
		t.Fatalf("expected organization clause, got %q", filters)
	}
	if !strings.Contains(filters, "d.project_id IN ?") {
		t.Fatalf("expected project clause, got %q", filters)
	}
	if !strings.Contains(filters, "d.api_key_id IS NULL") {
		t.Fatalf("expected dashboard upload clause, got %q", filters)
	}
	if len(args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(args))
	}
}
