package graphs

import (
	"testing"
	"time"
)

func TestBuildWorkflowWebhookBodyIsStable(t *testing.T) {
	finishedAt := time.Date(2026, 9, 24, 17, 15, 3, 412_000_000, time.FixedZone("ICT", 7*60*60))
	eventType, body, err := buildWorkflowWebhookBody("run-1", "graph-1", "project-1", "completed", finishedAt)
	if err != nil {
		t.Fatalf("buildWorkflowWebhookBody returned error: %v", err)
	}
	if eventType != "workflow.completed" {
		t.Fatalf("unexpected event type %q", eventType)
	}
	want := `{"type":"workflow.completed","timestamp":"2026-09-24T10:15:03.412Z","data":{"executionId":"run-1","workflowId":"graph-1","projectId":"project-1","status":"completed","finishedAt":"2026-09-24T10:15:03.412Z","execution":"/service/workflow-executions/run-1"}}`
	if body != want {
		t.Fatalf("unexpected body:\n got %s\nwant %s", body, want)
	}
	_, again, _ := buildWorkflowWebhookBody("run-1", "graph-1", "project-1", "completed", finishedAt)
	if again != body {
		t.Fatal("webhook body is not byte-stable")
	}
}

func TestWorkflowWebhookEventIDIsStablePerRun(t *testing.T) {
	if workflowWebhookEventID("run-1") != "evt_run-1" {
		t.Fatalf("unexpected event id %q", workflowWebhookEventID("run-1"))
	}
}
