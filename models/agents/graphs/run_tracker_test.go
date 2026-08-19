package graphs

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/arcnem-ai/arcnem-vision/models/shared/realtime"
	"github.com/smallnest/langgraphgo/graph"
	"gorm.io/gorm"
	gormtests "gorm.io/gorm/utils/tests"
)

func TestNodeErrorFinalizesAndPublishesWithoutGraphEnd(t *testing.T) {
	db, err := gorm.Open(gormtests.DummyDialector{}, &gorm.Config{DryRun: true})
	if err != nil {
		t.Fatalf("open dry-run db: %v", err)
	}
	if err := db.Callback().Update().Replace("gorm:update", func(tx *gorm.DB) {
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

	if len(reasons) != 2 || reasons[0] != realtime.DashboardReasonRunStepChanged || reasons[1] != realtime.DashboardReasonRunFinished {
		t.Fatalf("expected step and terminal notifications, got %#v", reasons)
	}
}

func TestTerminalRunUpdatesRecordsFailureState(t *testing.T) {
	updates, err := terminalRunUpdates(
		"failed",
		map[string]any{"node": "inspect"},
		errors.New("provider unavailable"),
	)
	if err != nil {
		t.Fatalf("terminalRunUpdates returned error: %v", err)
	}
	if updates["status"] != "failed" || updates["error"] != "provider unavailable" {
		t.Fatalf("unexpected failure updates: %#v", updates)
	}
	if updates["final_state"] != `{"node":"inspect"}` {
		t.Fatalf("unexpected final state: %#v", updates["final_state"])
	}
	if _, ok := updates["finished_at"].(time.Time); !ok {
		t.Fatalf("finished_at was not recorded: %#v", updates["finished_at"])
	}
}

func TestTerminalRunUpdatesRejectsFailureWithoutError(t *testing.T) {
	if _, err := terminalRunUpdates("failed", nil, nil); err == nil {
		t.Fatal("expected failed run without an error to be rejected")
	}
}

func TestTerminalRunUpdatesCompletesWithoutEncodableFinalState(t *testing.T) {
	updates, err := terminalRunUpdates("completed", make(chan struct{}), nil)
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

func TestUpdateRunningRunGuardsTerminalState(t *testing.T) {
	db, err := gorm.Open(gormtests.DummyDialector{}, &gorm.Config{DryRun: true})
	if err != nil {
		t.Fatalf("open dry-run db: %v", err)
	}

	tx := updateRunningRun(db, "run-1", map[string]any{"status": "failed"})
	query := tx.Statement.SQL.String()
	if !strings.Contains(query, "id = ? AND status = ?") {
		t.Fatalf("terminal update is not guarded by running status: %s", query)
	}
}
