package jobs

import (
	"context"
	"errors"
	"testing"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	inngesterrors "github.com/inngest/inngestgo/errors"
	"gorm.io/gorm"
)

func stubFinalizeRun(t *testing.T, fn func(graphs.RunOutcome) (bool, error)) *[]graphs.RunOutcome {
	t.Helper()
	var calls []graphs.RunOutcome
	previous := finalizeRun
	finalizeRun = func(_ *gorm.DB, _ string, _ string, outcome graphs.RunOutcome) (bool, error) {
		calls = append(calls, outcome)
		return fn(outcome)
	}
	t.Cleanup(func() { finalizeRun = previous })
	return &calls
}

func TestFinishRunKeepsPersistenceErrorsRetryable(t *testing.T) {
	calls := stubFinalizeRun(t, func(graphs.RunOutcome) (bool, error) {
		return false, errors.New("connection reset")
	})

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
}

func TestFinishRunReturnsCompletedState(t *testing.T) {
	stubFinalizeRun(t, func(graphs.RunOutcome) (bool, error) { return true, nil })

	state, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(map[string]any{"ok": true}))
	if err != nil {
		t.Fatalf("finishRun returned error: %v", err)
	}
	if state["ok"] != true {
		t.Fatalf("unexpected state: %#v", state)
	}
}

func TestFinishRunTreatsAlreadyTerminalRunAsSaved(t *testing.T) {
	stubFinalizeRun(t, func(graphs.RunOutcome) (bool, error) { return false, nil })

	if _, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.CompletedRun(nil)); err != nil {
		t.Fatalf("repeated finalization should succeed: %v", err)
	}
}

func TestFinishRunStopsFailedRunsWithoutRetry(t *testing.T) {
	calls := stubFinalizeRun(t, func(graphs.RunOutcome) (bool, error) { return true, nil })

	_, err := finishRun(context.Background(), nil, "run-1", "org-1", graphs.FailedRun(errors.New("error in node inspect: timeout")))
	if !inngesterrors.IsNoRetryError(err) {
		t.Fatalf("failed run should end without retry: %v", err)
	}
	if err.Error() == "" || len(*calls) != 1 || (*calls)[0].Error != "error in node inspect: timeout" {
		t.Fatalf("failed outcome was not persisted before stopping: %v %#v", err, *calls)
	}
}
