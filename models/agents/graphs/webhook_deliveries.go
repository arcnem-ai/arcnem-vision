package graphs

import (
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// workflowWebhookEvent is the frozen webhook request body. Struct field order is
// the wire order, so the same outcome always encodes to the same bytes.
type workflowWebhookEvent struct {
	Type      string                   `json:"type"`
	Timestamp string                   `json:"timestamp"`
	Data      workflowWebhookEventData `json:"data"`
}

type workflowWebhookEventData struct {
	ExecutionID string `json:"executionId"`
	WorkflowID  string `json:"workflowId"`
	ProjectID   string `json:"projectId"`
	Status      string `json:"status"`
	FinishedAt  string `json:"finishedAt"`
	Execution   string `json:"execution"`
}

// WebhookDispatch identifies one send request for a delivery. A resend gets a new
// dispatch ID, and only the current dispatch may record the delivery's outcome.
type WebhookDispatch struct {
	DeliveryID string `json:"delivery_id"`
	DispatchID string `json:"dispatch_id"`
}

type webhookRunSource struct {
	AgentGraphID string
	ProjectID    *string
	APIKeyID     *string
}

const webhookTimeFormat = "2006-01-02T15:04:05.000Z07:00"

func workflowWebhookEventID(runID string) string {
	return "evt_" + runID
}

func buildWorkflowWebhookBody(runID string, workflowID string, projectID string, status string, finishedAt time.Time) (string, string, error) {
	eventType := "workflow." + status
	finished := finishedAt.UTC().Format(webhookTimeFormat)
	body, err := json.Marshal(workflowWebhookEvent{
		Type:      eventType,
		Timestamp: finished,
		Data: workflowWebhookEventData{
			ExecutionID: runID,
			WorkflowID:  workflowID,
			ProjectID:   projectID,
			Status:      status,
			FinishedAt:  finished,
			Execution:   "/service/workflow-executions/" + runID,
		},
	})
	if err != nil {
		return "", "", fmt.Errorf("encode webhook body: %w", err)
	}
	return eventType, string(body), nil
}

// queueWebhookDeliveries inserts one pending delivery per eligible endpoint of the
// service key that started the run and returns their dispatches. It must run in the
// terminal-transition transaction so a finished run and its deliveries commit together.
func queueWebhookDeliveries(tx *gorm.DB, runID string, status string, finishedAt time.Time) ([]WebhookDispatch, error) {
	var source webhookRunSource
	if err := tx.Table("agent_graph_runs").
		Select("agent_graph_id, project_id, api_key_id").
		Where("id = ?", runID).
		Take(&source).Error; err != nil {
		return nil, fmt.Errorf("load webhook run source: %w", err)
	}
	if source.APIKeyID == nil || source.ProjectID == nil {
		return nil, nil
	}

	eventType, body, err := buildWorkflowWebhookBody(runID, source.AgentGraphID, *source.ProjectID, status, finishedAt)
	if err != nil {
		return nil, err
	}

	var dispatches []WebhookDispatch
	err = tx.Raw(`
		INSERT INTO webhook_deliveries (endpoint_id, run_id, event_id, event_type, body)
		SELECT e.id, ?, ?, ?, ?
		FROM webhook_endpoints e
		JOIN apikeys k ON k.id = e.api_key_id
		WHERE e.api_key_id = ?
		  AND e.project_id = ?
		  AND e.status = 'enabled'
		  AND k.project_id = e.project_id
		  AND k.enabled
		  AND (k.expires_at IS NULL OR k.expires_at > now())
		ON CONFLICT (endpoint_id, event_id) DO NOTHING
		RETURNING id::text AS delivery_id, dispatch_id::text AS dispatch_id`,
		runID,
		workflowWebhookEventID(runID),
		eventType,
		body,
		*source.APIKeyID,
		*source.ProjectID,
	).Scan(&dispatches).Error
	return dispatches, err
}

// pendingWebhookDispatches recovers a finished run's unsent deliveries when its
// finalize step replays after the transaction committed but before Inngest
// recorded the step result.
func pendingWebhookDispatches(db *gorm.DB, runID string) ([]WebhookDispatch, error) {
	var dispatches []WebhookDispatch
	err := db.Raw(`
		SELECT id::text AS delivery_id, dispatch_id::text AS dispatch_id
		FROM webhook_deliveries
		WHERE run_id = ? AND status = 'pending'
		ORDER BY id`, runID).Scan(&dispatches).Error
	return dispatches, err
}
