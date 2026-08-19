package load

import (
	"context"
	"encoding/json"
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

type workflowExecutionSnapshotRow struct {
	GraphSnapshot     json.RawMessage `gorm:"column:graph_snapshot"`
	GraphSnapshotHash *string         `gorm:"column:graph_snapshot_hash"`
}

func loadPinnedWorkflowSnapshot(ctx context.Context, db *gorm.DB, executionID uuid.UUID) (*graphs.Snapshot, error) {
	row := workflowExecutionSnapshotRow{}
	if err := db.WithContext(ctx).
		Table("agent_graph_runs").
		Select("graph_snapshot, graph_snapshot_hash").
		Where("id = ?", executionID).
		Take(&row).Error; err != nil {
		return nil, fmt.Errorf("load execution %s snapshot: %w", executionID, err)
	}
	return decodePinnedWorkflowSnapshotRow(executionID, row)
}

func decodePinnedWorkflowSnapshotRow(executionID uuid.UUID, row workflowExecutionSnapshotRow) (*graphs.Snapshot, error) {
	if len(row.GraphSnapshot) == 0 || row.GraphSnapshotHash == nil || *row.GraphSnapshotHash == "" {
		return nil, fmt.Errorf("execution %s has no pinned graph snapshot", executionID)
	}

	snapshot := &graphs.Snapshot{}
	if err := json.Unmarshal(row.GraphSnapshot, snapshot); err != nil {
		return nil, fmt.Errorf("decode execution %s graph snapshot: %w", executionID, err)
	}
	if snapshot.AgentGraph == nil {
		return nil, fmt.Errorf("execution %s graph snapshot has no workflow", executionID)
	}

	return snapshot, nil
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

func LoadWorkflowExecutionPayload(ctx context.Context, db *gorm.DB, documentIDs []uuid.UUID, executionID uuid.UUID) (*WorkflowExecutionPayload, error) {
	graphSnapshot, err := loadPinnedWorkflowSnapshot(ctx, db, executionID)
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
