package graphs

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/arcnem-ai/arcnem-vision/models/shared/realtime"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// TEST_DATABASE_URL enables the real PostgreSQL check. Temporary tables
// shadow the application tables only in this rollback transaction.
func TestFinalizeRunQueuesWebhookDeliveriesPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run the PostgreSQL finalization check")
	}
	previousPublisher := publishDashboardEvent
	publishDashboardEvent = func(context.Context, realtime.DashboardEvent) error { return nil }
	t.Cleanup(func() { publishDashboardEvent = previousPublisher })

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()

	const (
		project      = "019f2222-2222-7222-8222-222222222222"
		otherProject = "019f2222-2222-7222-8222-999999999999"
		graphID      = "019f3333-3333-7333-8333-333333333333"
		key          = "019f4444-4444-7444-8444-444444444441"
		disabledKey  = "019f4444-4444-7444-8444-444444444442"
		expiredKey   = "019f4444-4444-7444-8444-444444444443"
		endpoint     = "019f5555-5555-7555-8555-555555555551"
	)
	for _, statement := range []string{
		"SET LOCAL statement_timeout = '5s'",
		`CREATE TEMP TABLE agent_graph_runs (
			id uuid PRIMARY KEY, agent_graph_id uuid NOT NULL, project_id uuid, api_key_id uuid,
			status text NOT NULL, final_state jsonb, error text, finished_at timestamp
		) ON COMMIT DROP`,
		"CREATE TEMP TABLE apikeys (id uuid PRIMARY KEY, project_id uuid NOT NULL, enabled boolean NOT NULL, expires_at timestamp) ON COMMIT DROP",
		"CREATE TEMP TABLE webhook_endpoints (id uuid PRIMARY KEY, api_key_id uuid NOT NULL, project_id uuid NOT NULL, status text NOT NULL) ON COMMIT DROP",
		`CREATE TEMP TABLE webhook_deliveries (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(), endpoint_id uuid NOT NULL, run_id uuid NOT NULL,
			event_id text NOT NULL, event_type text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'pending',
			dispatch_id uuid NOT NULL DEFAULT gen_random_uuid(),
			UNIQUE (endpoint_id, event_id)
		) ON COMMIT DROP`,
	} {
		if err := tx.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	mustExec := func(sql string, values ...any) {
		t.Helper()
		if err := tx.Exec(sql, values...).Error; err != nil {
			t.Fatal(err)
		}
	}
	mustExec("INSERT INTO apikeys VALUES (?, ?, true, NULL), (?, ?, false, NULL), (?, ?, true, now() - interval '1 day')",
		key, project, disabledKey, project, expiredKey, project)
	mustExec(`INSERT INTO webhook_endpoints VALUES
		(?, ?, ?, 'enabled'),
		('019f5555-5555-7555-8555-555555555552', ?, ?, 'revoked'),
		('019f5555-5555-7555-8555-555555555553', ?, ?, 'enabled'),
		('019f5555-5555-7555-8555-555555555554', ?, ?, 'enabled'),
		('019f5555-5555-7555-8555-555555555555', ?, ?, 'enabled')`,
		endpoint, key, project,
		key, project,
		key, otherProject,
		disabledKey, project,
		expiredKey, project)
	newRun := func(id string, apiKeyID any) string {
		mustExec("INSERT INTO agent_graph_runs (id, agent_graph_id, project_id, api_key_id, status) VALUES (?, ?, ?, ?, 'running')",
			id, graphID, project, apiKeyID)
		return id
	}
	deliveries := func(runID string) []map[string]any {
		t.Helper()
		var rows []map[string]any
		if err := tx.Raw("SELECT endpoint_id::text, event_id, event_type, body, status FROM webhook_deliveries WHERE run_id = ?", runID).Scan(&rows).Error; err != nil {
			t.Fatal(err)
		}
		return rows
	}
	status := func(runID string) string {
		t.Helper()
		var value string
		if err := tx.Raw("SELECT status FROM agent_graph_runs WHERE id = ?", runID).Scan(&value).Error; err != nil {
			t.Fatal(err)
		}
		return value
	}

	t.Run("queues one delivery per eligible endpoint with the terminal transition", func(t *testing.T) {
		run := newRun("019f6666-6666-7666-8666-666666666661", key)
		result, err := FinalizeRun(tx, run, "org", CompletedRun(map[string]any{"summary": "ok"}))
		if err != nil || !result.Transitioned || len(result.Deliveries) != 1 || result.Deliveries[0].DispatchID == "" {
			t.Fatalf("FinalizeRun = %#v, %v", result, err)
		}
		rows := deliveries(run)
		if len(rows) != 1 || rows[0]["endpoint_id"] != endpoint {
			t.Fatalf("expected one delivery to the enabled same-project endpoint, got %#v", rows)
		}
		if rows[0]["event_id"] != "evt_"+run || rows[0]["event_type"] != "workflow.completed" || rows[0]["status"] != "pending" {
			t.Fatalf("unexpected delivery: %#v", rows[0])
		}
		var body workflowWebhookEvent
		if err := json.Unmarshal([]byte(rows[0]["body"].(string)), &body); err != nil {
			t.Fatalf("delivery body is not JSON: %v", err)
		}
		if body.Data.ExecutionID != run || body.Data.WorkflowID != graphID || body.Data.ProjectID != project || body.Data.Status != "completed" {
			t.Fatalf("unexpected body: %#v", body)
		}

		again, err := FinalizeRun(tx, run, "org", FailedRun(errors.New("late failure")))
		if err != nil || again.Transitioned || len(again.Deliveries) != 1 || again.Deliveries[0] != result.Deliveries[0] {
			t.Fatalf("a replayed FinalizeRun must return the still-pending delivery: %#v, %v", again, err)
		}
		mustExec("UPDATE webhook_deliveries SET status = 'delivered' WHERE run_id = ?", run)
		if delivered, err := FinalizeRun(tx, run, "org", CompletedRun(nil)); err != nil || len(delivered.Deliveries) != 0 {
			t.Fatalf("delivered webhooks must not be requested again: %#v, %v", delivered, err)
		}
		if status(run) != "completed" || len(deliveries(run)) != 1 {
			t.Fatalf("repeated finalization changed the run or its deliveries: %s %#v", status(run), deliveries(run))
		}
	})

	t.Run("skips disabled and expired keys and runs without a key", func(t *testing.T) {
		for _, apiKeyID := range []any{disabledKey, expiredKey, nil} {
			run := newRun(newTestRunID(t, tx), apiKeyID)
			if result, err := FinalizeRun(tx, run, "org", FailedRun(errors.New("node failed"))); err != nil || len(result.Deliveries) != 0 {
				t.Fatalf("FinalizeRun = %#v, %v", result, err)
			}
			if status(run) != "failed" || len(deliveries(run)) != 0 {
				t.Fatalf("key %v: status %s deliveries %#v", apiKeyID, status(run), deliveries(run))
			}
		}
	})

	t.Run("a failed delivery insert rolls back the terminal transition", func(t *testing.T) {
		mustExec("ALTER TABLE webhook_deliveries ADD CONSTRAINT reject_failed_events CHECK (event_type <> 'workflow.failed')")
		run := newRun("019f6666-6666-7666-8666-666666666669", key)
		if _, err := FinalizeRun(tx, run, "org", FailedRun(errors.New("node failed"))); err == nil {
			t.Fatal("expected the delivery insert to fail")
		}
		if status(run) != "running" || len(deliveries(run)) != 0 {
			t.Fatalf("partial finalization committed: %s %#v", status(run), deliveries(run))
		}
	})
}

func newTestRunID(t *testing.T, tx *gorm.DB) string {
	t.Helper()
	var id string
	if err := tx.Raw("SELECT gen_random_uuid()::text").Scan(&id).Error; err != nil {
		t.Fatal(err)
	}
	return id
}
