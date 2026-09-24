package graphs

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestGraphRunOutcomeTreatsErrorsAsFailure(t *testing.T) {
	outcome := GraphRunOutcome(map[string]any{"partial": true}, errors.New("error in node inspect: timeout"))
	if outcome.Status != "failed" || outcome.Error != "error in node inspect: timeout" {
		t.Fatalf("unexpected failed outcome: %#v", outcome)
	}
	if outcome.FinalState != nil {
		t.Fatalf("failed outcome kept graph state: %#v", outcome.FinalState)
	}
}

func TestGraphRunOutcomeCompletesWithState(t *testing.T) {
	outcome := GraphRunOutcome(map[string]any{"summary": "ok"}, nil)
	if outcome.Status != "completed" || outcome.Error != "" || outcome.FinalState["summary"] != "ok" {
		t.Fatalf("unexpected completed outcome: %#v", outcome)
	}
}

func TestFailedRunAlwaysHasAnError(t *testing.T) {
	if outcome := FailedRun(nil); outcome.Error == "" {
		t.Fatalf("failed outcome had no error: %#v", outcome)
	}
	if outcome := FailedRun(errors.New("")); outcome.Error == "" {
		t.Fatalf("failed outcome had an empty error: %#v", outcome)
	}
}

func TestRunOutcomeSurvivesCheckpointEncoding(t *testing.T) {
	original := CompletedRun(map[string]any{"labels": []any{"shelf"}, "count": float64(2)})
	encoded, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal outcome: %v", err)
	}
	var decoded RunOutcome
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal outcome: %v", err)
	}
	if !reflect.DeepEqual(decoded, original) {
		t.Fatalf("checkpointed outcome changed: %#v != %#v", decoded, original)
	}
}

func TestGraphRunOutcomeOmitsUnencodableState(t *testing.T) {
	outcome := GraphRunOutcome(map[string]any{"channel": make(chan struct{})}, nil)
	if outcome.Status != "completed" || outcome.FinalState != nil {
		t.Fatalf("unencodable state should complete without state: %#v", outcome)
	}
	if _, err := json.Marshal(outcome); err != nil {
		t.Fatalf("outcome cannot be checkpointed: %v", err)
	}
}

func TestGraphRunOutcomeFailsStateTooLargeToCheckpoint(t *testing.T) {
	outcome := GraphRunOutcome(map[string]any{"text": strings.Repeat("a", MaxCheckpointedStateBytes)}, nil)
	if outcome.Status != "failed" || outcome.FinalState != nil {
		t.Fatalf("oversized state should fail the run: %#v", outcome)
	}
	if !strings.Contains(outcome.Error, "checkpoint limit") {
		t.Fatalf("unexpected error: %q", outcome.Error)
	}
}

func TestFailedRunBoundsLongErrors(t *testing.T) {
	long := strings.Repeat("é", MaxRunErrorBytes)
	outcome := GraphRunOutcome(nil, errors.New(long))
	if outcome.Status != "failed" || len(outcome.Error) > MaxRunErrorBytes+64 {
		t.Fatalf("failure message was not bounded: %d bytes", len(outcome.Error))
	}
	if !utf8.ValidString(outcome.Error) || !strings.Contains(outcome.Error, "truncated") {
		t.Fatalf("truncated message is invalid or unmarked: %q", outcome.Error[len(outcome.Error)-40:])
	}
	if short := FailedRun(errors.New("provider unavailable")); short.Error != "provider unavailable" {
		t.Fatalf("short errors should be unchanged: %q", short.Error)
	}
}
