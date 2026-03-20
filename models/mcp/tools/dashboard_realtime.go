package tools

import (
	"context"
	"errors"
	"fmt"
	"log"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/arcnem-ai/arcnem-vision/models/shared/realtime"
	"gorm.io/gorm"
)

func publishDashboardDescriptionEvent(
	ctx context.Context,
	db *gorm.DB,
	documentID string,
) {
	event, err := buildDashboardDescriptionEvent(db, documentID)
	if err != nil {
		log.Printf(
			"dashboard realtime description_event_build_failed document_id=%s err=%v",
			documentID,
			err,
		)
		return
	}

	if err := realtime.PublishDashboardEvent(ctx, event); err != nil {
		log.Printf(
			"dashboard realtime description_event_publish_failed document_id=%s err=%v",
			documentID,
			err,
		)
	}
}

func publishDashboardSegmentationEvent(
	ctx context.Context,
	sourceDocument dbmodels.Document,
	segmentedDocumentID string,
) {
	event := realtime.NewDashboardEvent(
		realtime.DashboardReasonSegmentationCreated,
		sourceDocument.OrganizationID,
	)
	event.SourceDocumentID = sourceDocument.ID
	event.SegmentedDocumentID = segmentedDocumentID

	if err := realtime.PublishDashboardEvent(ctx, event); err != nil {
		log.Printf(
			"dashboard realtime segmentation_event_publish_failed source_document_id=%s segmented_document_id=%s err=%v",
			sourceDocument.ID,
			segmentedDocumentID,
			err,
		)
	}
}

func buildDashboardDescriptionEvent(
	db *gorm.DB,
	documentID string,
) (realtime.DashboardEvent, error) {
	var document dbmodels.Document
	if err := db.
		Select("id", "organization_id").
		Where("id = ?", documentID).
		First(&document).Error; err != nil {
		return realtime.DashboardEvent{}, fmt.Errorf("load document: %w", err)
	}

	event := realtime.NewDashboardEvent(
		realtime.DashboardReasonDescriptionUpserted,
		document.OrganizationID,
	)
	event.DocumentID = document.ID

	var segmentation dbmodels.DocumentSegmentation
	if err := db.
		Select("source_document_id").
		Where("segmented_document_id = ?", documentID).
		Order("created_at desc").
		First(&segmentation).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return event, nil
		}
		return realtime.DashboardEvent{}, fmt.Errorf(
			"load segmentation source document: %w",
			err,
		)
	}

	event.SourceDocumentID = segmentation.SourceDocumentID
	return event, nil
}
