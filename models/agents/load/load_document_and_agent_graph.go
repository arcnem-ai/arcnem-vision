package load

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func LoadDocumentAndAgentGraph(ctx context.Context, db *gorm.DB, documentID uuid.UUID, agentGraphID *uuid.UUID) (*DocumentAndAgentGraph, error) {
	querySpec := buildDocumentAndAgentGraphQuerySpec(documentID, agentGraphID)
	row, err := queryDocumentAndAgentGraphRow(ctx, db, documentID, querySpec)
	if err != nil {
		return nil, err
	}

	return decodeDocumentAndAgentGraphRow(row)
}

func queryDocumentAndAgentGraphRow(
	ctx context.Context,
	db *gorm.DB,
	documentID uuid.UUID,
	querySpec documentAndAgentGraphQuerySpec,
) (DocumentAndAgentGraphRow, error) {
	row := DocumentAndAgentGraphRow{}
	tx := db.WithContext(ctx).
		Raw(loadDocumentAndAgentGraphQuery(querySpec.graphJoin), querySpec.args...).
		Scan(&row)
	if tx.Error != nil {
		return row, tx.Error
	}
	if tx.RowsAffected == 0 {
		return row, fmt.Errorf(
			"document %s not found or has no related device",
			documentID,
		)
	}

	return row, nil
}
