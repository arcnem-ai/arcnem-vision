package tools

import (
	"sort"
	"strings"
)

func expandedDocumentSearchLimit(limit int) int {
	candidateLimit := limit * 3
	if candidateLimit < hybridSearchCandidateFloor {
		candidateLimit = hybridSearchCandidateFloor
	}
	if candidateLimit > maxHybridSearchCandidateLimit {
		candidateLimit = maxHybridSearchCandidateLimit
	}
	return candidateLimit
}

func fuseDocumentSearchSignalSets(
	signalSets []documentSearchSignalSet,
	limit int,
) []documentSearchCandidate {
	type fusedDocumentScore struct {
		Row                   documentSearchRow
		Score                 float64
		DefaultMatchReason    string
		StrongestContribution float64
	}

	byDocumentID := map[string]*fusedDocumentScore{}
	for _, signalSet := range signalSets {
		for index, row := range signalSet.Rows {
			if strings.TrimSpace(row.DocumentID) == "" {
				continue
			}

			contribution := signalSet.Weight /
				(reciprocalRankFusionOffset + float64(index+1))
			accumulator, ok := byDocumentID[row.DocumentID]
			if !ok {
				row.Score = 0
				accumulator = &fusedDocumentScore{Row: row}
				byDocumentID[row.DocumentID] = accumulator
			} else {
				accumulator.Row = mergeDocumentSearchRows(accumulator.Row, row)
			}

			accumulator.Score += contribution
			if contribution > accumulator.StrongestContribution {
				accumulator.StrongestContribution = contribution
				accumulator.DefaultMatchReason = signalSet.DefaultMatchReason
			}
		}
	}

	candidates := make([]documentSearchCandidate, 0, len(byDocumentID))
	for _, candidate := range byDocumentID {
		candidate.Row.Score = candidate.Score
		candidates = append(candidates, documentSearchCandidate{
			Row:                candidate.Row,
			DefaultMatchReason: candidate.DefaultMatchReason,
		})
	}

	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Row.Score == candidates[j].Row.Score {
			return candidates[i].Row.CreatedAt.After(candidates[j].Row.CreatedAt)
		}
		return candidates[i].Row.Score > candidates[j].Row.Score
	})

	if len(candidates) > limit {
		candidates = candidates[:limit]
	}

	return candidates
}

func mergeDocumentSearchRows(
	current documentSearchRow,
	incoming documentSearchRow,
) documentSearchRow {
	if strings.TrimSpace(current.ObjectKey) == "" &&
		strings.TrimSpace(incoming.ObjectKey) != "" {
		current.ObjectKey = incoming.ObjectKey
	}
	if strings.TrimSpace(current.ContentType) == "" &&
		strings.TrimSpace(incoming.ContentType) != "" {
		current.ContentType = incoming.ContentType
	}
	if current.SizeBytes == 0 && incoming.SizeBytes > 0 {
		current.SizeBytes = incoming.SizeBytes
	}
	if strings.TrimSpace(current.ProjectID) == "" &&
		strings.TrimSpace(incoming.ProjectID) != "" {
		current.ProjectID = incoming.ProjectID
	}
	if strings.TrimSpace(current.ProjectName) == "" &&
		strings.TrimSpace(incoming.ProjectName) != "" {
		current.ProjectName = incoming.ProjectName
	}
	if current.DeviceID == nil && incoming.DeviceID != nil {
		current.DeviceID = incoming.DeviceID
	}
	if current.DeviceName == nil && incoming.DeviceName != nil {
		current.DeviceName = incoming.DeviceName
	}
	if strings.TrimSpace(current.DescriptionText) == "" &&
		strings.TrimSpace(incoming.DescriptionText) != "" {
		current.DescriptionText = incoming.DescriptionText
	}
	if strings.TrimSpace(current.OCRText) == "" &&
		strings.TrimSpace(incoming.OCRText) != "" {
		current.OCRText = incoming.OCRText
	}
	if incoming.CreatedAt.After(current.CreatedAt) {
		current.CreatedAt = incoming.CreatedAt
	}
	return current
}
