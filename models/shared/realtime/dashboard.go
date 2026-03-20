package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const DashboardEventVersion = 1

const (
	DashboardScopeDocuments = "documents"
	DashboardScopeRuns      = "runs"
)

const (
	DashboardReasonDocumentCreated     = "document-created"
	DashboardReasonDescriptionUpserted = "description-upserted"
	DashboardReasonSegmentationCreated = "segmentation-created"
	DashboardReasonRunCreated          = "run-created"
	DashboardReasonRunStepChanged      = "run-step-changed"
	DashboardReasonRunFinished         = "run-finished"
)

type DashboardEvent struct {
	Version             int    `json:"version"`
	Scope               string `json:"scope"`
	Reason              string `json:"reason"`
	OrganizationID      string `json:"organizationId"`
	OccurredAt          string `json:"occurredAt"`
	DocumentID          string `json:"documentId,omitempty"`
	SourceDocumentID    string `json:"sourceDocumentId,omitempty"`
	SegmentedDocumentID string `json:"segmentedDocumentId,omitempty"`
	RunID               string `json:"runId,omitempty"`
}

var (
	redisClient     *redis.Client
	redisClientErr  error
	redisClientOnce sync.Once
)

func DashboardChannel(organizationID string) string {
	return fmt.Sprintf("dashboard:org:%s:events", organizationID)
}

func NewDashboardEvent(reason string, organizationID string) DashboardEvent {
	return DashboardEvent{
		Version:        DashboardEventVersion,
		Scope:          dashboardScopeForReason(reason),
		Reason:         reason,
		OrganizationID: organizationID,
		OccurredAt:     time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func PublishDashboardEvent(ctx context.Context, event DashboardEvent) error {
	client, err := getRedisClient()
	if err != nil {
		return err
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal dashboard realtime event: %w", err)
	}

	return client.Publish(ctx, DashboardChannel(event.OrganizationID), payload).Err()
}

func getRedisClient() (*redis.Client, error) {
	redisClientOnce.Do(func() {
		redisURL := strings.TrimSpace(os.Getenv("REDIS_URL"))
		if redisURL == "" {
			redisClientErr = fmt.Errorf("REDIS_URL is not set")
			return
		}

		options, err := redis.ParseURL(redisURL)
		if err != nil {
			redisClientErr = fmt.Errorf("parse REDIS_URL: %w", err)
			return
		}

		redisClient = redis.NewClient(options)
	})

	if redisClientErr != nil {
		return nil, redisClientErr
	}

	return redisClient, nil
}

func dashboardScopeForReason(reason string) string {
	switch reason {
	case DashboardReasonDocumentCreated,
		DashboardReasonDescriptionUpserted,
		DashboardReasonSegmentationCreated:
		return DashboardScopeDocuments
	case DashboardReasonRunCreated,
		DashboardReasonRunStepChanged,
		DashboardReasonRunFinished:
		return DashboardScopeRuns
	default:
		return ""
	}
}
