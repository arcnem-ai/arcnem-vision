package graphs

import (
	"context"
	"errors"
	"testing"
	"time"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/arcnem-ai/arcnem-vision/models/shared/realtime"
	"github.com/smallnest/langgraphgo/graph"
	"gorm.io/gorm"
	gormtests "gorm.io/gorm/utils/tests"
)

func TestNodeErrorRecordsStepWithoutFinalizingRun(t *testing.T) {
	db, err := gorm.Open(gormtests.DummyDialector{}, &gorm.Config{DryRun: true})
	if err != nil {
		t.Fatalf("open dry-run db: %v", err)
	}
	var updates []map[string]any
	if err := db.Callback().Update().Replace("gorm:update", func(tx *gorm.DB) {
		if values, ok := tx.Statement.Dest.(map[string]any); ok {
			updates = append(updates, values)
		}
		tx.RowsAffected = 1
	}); err != nil {
		t.Fatalf("replace dry-run update callback: %v", err)
	}

	previousPublisher := publishDashboardEvent
	var reasons []string
	publishDashboardEvent = func(_ context.Context, event realtime.DashboardEvent) error {
		reasons = append(reasons, event.Reason)
		return nil
	}
	t.Cleanup(func() { publishDashboardEvent = previousPublisher })

	tracker := &RunTracker{
		db:             db,
		run:            &dbmodels.AgentGraphRun{ID: "run-1"},
		organizationID: "org-1",
		steps: map[string]*dbmodels.AgentGraphRunStep{
			"span-1": {RunID: "run-1", NodeKey: "inspect", StepOrder: 1},
		},
	}
	tracker.OnEvent(context.Background(), &graph.TraceSpan{
		ID:       "span-1",
		Event:    graph.TraceEventNodeError,
		NodeName: "inspect",
		EndTime:  time.Now(),
		Error:    errors.New("provider unavailable"),
	})

	if len(reasons) != 1 || reasons[0] != realtime.DashboardReasonRunStepChanged {
		t.Fatalf("expected only a step notification, got %#v", reasons)
	}
	if len(updates) != 1 {
		t.Fatalf("expected one step update, got %#v", updates)
	}
	if _, ok := updates[0]["status"]; ok {
		t.Fatalf("node error wrote a terminal run status: %#v", updates[0])
	}
}

func TestTerminalRunUpdatesRecordsCompletedState(t *testing.T) {
	updates, err := terminalRunUpdates(CompletedRun(map[string]any{"node": "inspect"}))
	if err != nil {
		t.Fatalf("terminalRunUpdates returned error: %v", err)
	}
	if updates["status"] != "completed" || updates["error"] != nil {
		t.Fatalf("unexpected completed updates: %#v", updates)
	}
	if updates["final_state"] != `{"node":"inspect"}` {
		t.Fatalf("unexpected final state: %#v", updates["final_state"])
	}
	if _, ok := updates["finished_at"].(time.Time); !ok {
		t.Fatalf("finished_at was not recorded: %#v", updates["finished_at"])
	}
}

func TestTerminalRunUpdatesRecordsFailure(t *testing.T) {
	updates, err := terminalRunUpdates(FailedRun(errors.New("provider unavailable")))
	if err != nil {
		t.Fatalf("terminalRunUpdates returned error: %v", err)
	}
	if updates["status"] != "failed" || updates["error"] != "provider unavailable" {
		t.Fatalf("unexpected failure updates: %#v", updates)
	}
	if _, ok := updates["final_state"]; ok {
		t.Fatalf("failed run recorded a final state: %#v", updates)
	}
}

func TestTerminalRunUpdatesRejectsFailureWithoutError(t *testing.T) {
	if _, err := terminalRunUpdates(RunOutcome{Status: "failed"}); err == nil {
		t.Fatal("expected failed run without an error to be rejected")
	}
}

func TestTerminalRunUpdatesRejectsUnknownStatus(t *testing.T) {
	if _, err := terminalRunUpdates(RunOutcome{Status: "running"}); err == nil {
		t.Fatal("expected a non-terminal status to be rejected")
	}
}

func TestTerminalRunUpdatesCompletesWithoutEncodableFinalState(t *testing.T) {
	updates, err := terminalRunUpdates(CompletedRun(map[string]any{"channel": make(chan struct{})}))
	if err != nil {
		t.Fatalf("terminalRunUpdates returned error: %v", err)
	}
	if updates["status"] != "completed" {
		t.Fatalf("run was not completed: %#v", updates)
	}
	if _, ok := updates["final_state"]; ok {
		t.Fatalf("unencodable final state was persisted: %#v", updates)
	}
}
