package tools

import (
	"strings"
	"time"
)

func buildDocumentSearchMatches(rows []documentSearchRow, query string, defaultMatchReason string) []DocumentSearchMatch {
	matches := make([]DocumentSearchMatch, 0, len(rows))
	for _, row := range rows {
		matches = append(
			matches,
			buildDocumentSearchMatch(row, query, defaultMatchReason, true),
		)
	}

	return matches
}

func buildDocumentSearchMatchesFromCandidates(candidates []documentSearchCandidate, query string) []DocumentSearchMatch {
	matches := make([]DocumentSearchMatch, 0, len(candidates))
	for _, candidate := range candidates {
		matches = append(
			matches,
			buildDocumentSearchMatch(
				candidate.Row,
				query,
				candidate.DefaultMatchReason,
				false,
			),
		)
	}

	return matches
}

func buildDocumentSearchMatch(
	row documentSearchRow,
	query string,
	defaultMatchReason string,
	allowDefaultForEmptyQuery bool,
) DocumentSearchMatch {
	label := buildDocumentLabel(row.ObjectKey, row.DocumentID)
	snippet, matchReason := buildSearchSnippet(
		query,
		row.DescriptionText,
		row.OCRText,
		row.ObjectKey,
		row.ProjectName,
		row.DeviceName,
	)
	if snippet == "" {
		snippet = buildPreferredExcerpt(row.DescriptionText, row.OCRText, row.ObjectKey)
	}
	if defaultMatchReason != "" && (matchReason == "document context" || (allowDefaultForEmptyQuery && strings.TrimSpace(query) == "")) {
		matchReason = defaultMatchReason
	}

	citation := DocumentChatCitation{
		DocumentID:  row.DocumentID,
		ProjectID:   row.ProjectID,
		ProjectName: row.ProjectName,
		DeviceID:    row.DeviceID,
		DeviceName:  row.DeviceName,
		Label:       label,
		Excerpt:     snippet,
		MatchReason: matchReason,
	}

	return DocumentSearchMatch{
		DocumentID:  row.DocumentID,
		ObjectKey:   row.ObjectKey,
		ContentType: row.ContentType,
		SizeBytes:   row.SizeBytes,
		CreatedAt:   row.CreatedAt.Format(time.RFC3339),
		ProjectID:   row.ProjectID,
		ProjectName: row.ProjectName,
		DeviceID:    row.DeviceID,
		DeviceName:  row.DeviceName,
		Label:       label,
		Snippet:     snippet,
		MatchReason: matchReason,
		Score:       row.Score,
		Citation:    citation,
	}
}
