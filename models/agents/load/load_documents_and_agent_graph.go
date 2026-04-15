package load

import (
	"context"
	"fmt"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WorkflowExecutionPayload struct {
	Documents     []*dbmodels.Document `json:"documents"`
	GraphSnapshot *graphs.Snapshot     `json:"graph_snapshot"`
}

func orderWorkflowDocuments(documentIDs []uuid.UUID, rows []*dbmodels.Document, organizationID string) ([]*dbmodels.Document, error) {
	byID := make(map[string]*dbmodels.Document, len(rows))
	for _, row := range rows {
		if organizationID != "" && row.OrganizationID != organizationID {
			return nil, fmt.Errorf(
				"document %s does not belong to workflow organization %s",
				row.ID,
				organizationID,
			)
		}

		byID[row.ID] = row
	}

	ordered := make([]*dbmodels.Document, 0, len(documentIDs))
	for _, documentID := range documentIDs {
		document := byID[documentID.String()]
		if document == nil {
			return nil, fmt.Errorf("document %s not found", documentID)
		}
		ordered = append(ordered, document)
	}

	return ordered, nil
}

func LoadWorkflowExecutionPayload(ctx context.Context, db *gorm.DB, documentIDs []uuid.UUID, agentGraphID uuid.UUID) (*WorkflowExecutionPayload, error) {
	graphSnapshot, err := LoadAgentGraphSnapshot(ctx, db, agentGraphID)
	if err != nil {
		return nil, err
	}

	if len(documentIDs) == 0 {
		return nil, fmt.Errorf("workflow execution requires at least one document")
	}

	var rows []*dbmodels.Document
	if err := db.WithContext(ctx).
		Where("id IN ?", documentIDs).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	organizationID := ""
	if graphSnapshot.AgentGraph != nil {
		organizationID = graphSnapshot.AgentGraph.OrganizationID
	}

	ordered, err := orderWorkflowDocuments(documentIDs, rows, organizationID)
	if err != nil {
		return nil, err
	}

	return &WorkflowExecutionPayload{
		Documents:     ordered,
		GraphSnapshot: graphSnapshot,
	}, nil
}
