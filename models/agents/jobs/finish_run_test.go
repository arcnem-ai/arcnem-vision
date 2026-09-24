package jobs

import (
	"context"
	"errors"
	"testing"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	inngesterrors "github.com/inngest/inngestgo/errors"
	"gorm.io/gorm"
)

func stubFinalizeRun(t *testing.T, fn func(graphs.RunOutcome) (graphs.FinalizeResult, error)) *[]graphs.RunOutcome {
	t.Helper()
	var calls []graphs.RunOutcome
	previous := finalizeRun
	finalizeRun = func(_ *gorm.DB, _ string, _ string, outcome graphs.RunOutcome) (graphs.FinalizeResult, error) {
		calls = append(calls, outcome)
		return fn(outcome)
	}
	t.Cleanup(func() { finalizeRun = previous })
	return &calls
}

func stubRequestWebhookDeliveries(t *testing.T, err error) *[][]graphs.WebhookDispatch {
	t.Helper()
	var calls [][]graphs.WebhookDispatch
	previous := requestWebhookDeliveries
	requestWebhookDeliveries = func(_ context.Context, deliveries []graphs.WebhookDispatch) error {
		calls = append(calls, deliveries)
		return err
	}
	t.Cleanup(func() { requestWebhookDeliveries = previous })
	return &calls
}

func saved(deliveryIDs ...string) (graphs.FinalizeResult, error) {
	deliveries := make([]graphs.WebhookDispatch, len(deliveryIDs))
	for i, id := range deliveryIDs {
		deliveries[i] = graphs.WebhookDispatch{DeliveryID: id, DispatchID: "dispatch-" + id}
	}
	return graphs.FinalizeResult{Transitioned: true, Deliveries: deliveries}, nil
}

func TestFinishRunKeepsPersistenceErrorsRetryable(t *testing.T) {
	calls := stubFinalizeRun(t, func(graphs.RunOutcome) (graphs.FinalizeResult, error) {
		return graphs.FinalizeResult{}, errors.New("connection reset")
	})
	sends := stubRequestWebhookDeliveries(t, nil)

	state, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(map[string]any{"ok": true}))
	if err == nil {
		t.Fatal("expected the persistence error to be returned")
	}
	if inngesterrors.IsNoRetryError(err) {
		t.Fatalf("persistence error must stay retryable: %v", err)
	}
	if state != nil {
		t.Fatalf("unsaved run returned state: %#v", state)
	}
	if len(*calls) != 1 || (*calls)[0].Status != "completed" {
		t.Fatalf("completed outcome was not the one persisted: %#v", *calls)
	}
	if len(*sends) != 0 {
		t.Fatalf("deliveries were requested for an unsaved run: %#v", *sends)
	}
}

func TestFinishRunReturnsCompletedState(t *testing.T) {
	stubFinalizeRun(t, func(graphs.RunOutcome) (graphs.FinalizeResult, error) { return saved() })
	sends := stubRequestWebhookDeliveries(t, nil)

	state, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(map[string]any{"ok": true}))
	if err != nil {
		t.Fatalf("finishRun returned error: %v", err)
	}
	if state["ok"] != true {
		t.Fatalf("unexpected state: %#v", state)
	}
	if len(*sends) != 0 {
		t.Fatalf("no deliveries were queued, but a send was requested: %#v", *sends)
	}
}

func TestFinishRunTreatsAlreadyTerminalRunAsSaved(t *testing.T) {
	stubFinalizeRun(t, func(graphs.RunOutcome) (graphs.FinalizeResult, error) {
		return graphs.FinalizeResult{}, nil
	})
	stubRequestWebhookDeliveries(t, nil)

	if _, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(nil)); err != nil {
		t.Fatalf("repeated finalization should succeed: %v", err)
	}
}

func TestFinishRunStopsFailedRunsWithoutRetry(t *testing.T) {
	calls := stubFinalizeRun(t, func(graphs.RunOutcome) (graphs.FinalizeResult, error) { return saved("delivery-1") })
	sends := stubRequestWebhookDeliveries(t, nil)

	_, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.FailedRun(errors.New("error in node inspect: timeout")))
	if !inngesterrors.IsNoRetryError(err) {
		t.Fatalf("failed run should end without retry: %v", err)
	}
	if err.Error() == "" || len(*calls) != 1 || (*calls)[0].Error != "error in node inspect: timeout" {
		t.Fatalf("failed outcome was not persisted before stopping: %v %#v", err, *calls)
	}
	if len(*sends) != 1 || (*sends)[0][0].DeliveryID != "delivery-1" {
		t.Fatalf("failed run deliveries were not requested: %#v", *sends)
	}
}

func TestFinishRunRequestsQueuedDeliveries(t *testing.T) {
	stubFinalizeRun(t, func(graphs.RunOutcome) (graphs.FinalizeResult, error) { return saved("delivery-1", "delivery-2") })
	sends := stubRequestWebhookDeliveries(t, nil)

	if _, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(nil)); err != nil {
		t.Fatalf("finishRun returned error: %v", err)
	}
	if len(*sends) != 1 || len((*sends)[0]) != 2 {
		t.Fatalf("expected one request for both deliveries, got %#v", *sends)
	}
}

func TestFinishRunRequestsPendingDeliveriesWhenFinalizationReplays(t *testing.T) {
	stubFinalizeRun(t, func(graphs.RunOutcome) (graphs.FinalizeResult, error) {
		return graphs.FinalizeResult{Deliveries: []graphs.WebhookDispatch{{DeliveryID: "delivery-1", DispatchID: "dispatch-1"}}}, nil
	})
	sends := stubRequestWebhookDeliveries(t, nil)

	if _, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(nil)); err != nil {
		t.Fatalf("finishRun returned error: %v", err)
	}
	if len(*sends) != 1 || (*sends)[0][0].DispatchID != "dispatch-1" {
		t.Fatalf("pending deliveries were not requested after a replay: %#v", *sends)
	}
}

func TestFinishRunKeepsDeliveryRequestErrorsRetryable(t *testing.T) {
	stubFinalizeRun(t, func(graphs.RunOutcome) (graphs.FinalizeResult, error) { return saved("delivery-1") })
	stubRequestWebhookDeliveries(t, errors.New("inngest unavailable"))

	_, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(nil))
	if err == nil || inngesterrors.IsNoRetryError(err) {
		t.Fatalf("delivery request errors must stay retryable: %v", err)
	}
}
