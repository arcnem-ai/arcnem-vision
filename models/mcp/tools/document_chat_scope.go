package tools

import (
	"fmt"
	"strings"
)

func buildDocumentScopeFilters(alias string, scope ChatDocumentScope) (string, []any) {
	clauses := []string{fmt.Sprintf("%s.organization_id = ?", alias)}
	args := []any{scope.OrganizationID}

	if ids := dedupeNonEmpty(scope.ProjectIDs); len(ids) > 0 {
		clauses = append(clauses, fmt.Sprintf("%s.project_id IN ?", alias))
		args = append(args, ids)
	}
	if ids := dedupeNonEmpty(scope.APIKeyIDs); len(ids) > 0 {
		clauses = append(clauses, fmt.Sprintf("%s.api_key_id IN ?", alias))
		args = append(args, ids)
	}
	if ids := dedupeNonEmpty(scope.DocumentIDs); len(ids) > 0 {
		clauses = append(clauses, fmt.Sprintf("%s.id IN ?", alias))
		args = append(args, ids)
	}
	if scope.DashboardUploadsOnly {
		clauses = append(clauses, fmt.Sprintf("%s.api_key_id IS NULL", alias))
	}

	return strings.Join(clauses, " AND "), args
}

func dedupeNonEmpty(values []string) []string {
	deduped := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		deduped = append(deduped, trimmed)
	}
	return deduped
}

func intersectDocumentIDs(scopeDocumentIDs []string, requestedDocumentIDs []string) []string {
	scopeIDs := dedupeNonEmpty(scopeDocumentIDs)
	requestedIDs := dedupeNonEmpty(requestedDocumentIDs)
	if len(scopeIDs) == 0 {
		return requestedIDs
	}

	allowed := map[string]struct{}{}
	for _, id := range scopeIDs {
		allowed[id] = struct{}{}
	}

	intersection := make([]string, 0, len(requestedIDs))
	for _, id := range requestedIDs {
		if _, ok := allowed[id]; ok {
			intersection = append(intersection, id)
		}
	}
	return intersection
}
