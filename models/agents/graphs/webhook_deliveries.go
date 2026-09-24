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
// service key that started the run. It must run in the terminal-transition
// transaction so a finished run and its deliveries commit together.
func queueWebhookDeliveries(tx *gorm.DB, runID string, status string, finishedAt time.Time) error {
	var source webhookRunSource
	if err := tx.Table("agent_graph_runs").
		Select("agent_graph_id, project_id, api_key_id").
		Where("id = ?", runID).
		Take(&source).Error; err != nil {
		return fmt.Errorf("load webhook run source: %w", err)
	}
	if source.APIKeyID == nil || source.ProjectID == nil {
		return nil
	}

	eventType, body, err := buildWorkflowWebhookBody(runID, source.AgentGraphID, *source.ProjectID, status, finishedAt)
	if err != nil {
		return err
	}

	return tx.Exec(`
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
		ON CONFLICT (endpoint_id, event_id) DO NOTHING`,
		runID,
		workflowWebhookEventID(runID),
		eventType,
		body,
		*source.APIKeyID,
		*source.ProjectID,
	).Error
}
