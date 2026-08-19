package graphs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/arcnem-ai/arcnem-vision/models/shared/realtime"
	"github.com/smallnest/langgraphgo/graph"
	"gorm.io/gorm"
)

// Verify RunTracker implements TraceHook.
var _ graph.TraceHook = (*RunTracker)(nil)

var publishDashboardEvent = realtime.PublishDashboardEvent

// RunTracker records graph execution to the agent_graph_runs and agent_graph_run_steps tables.
type RunTracker struct {
	db             *gorm.DB
	run            *dbmodels.AgentGraphRun
	organizationID string
	stepOrder      atomic.Int32
	mu             sync.Mutex
	// steps tracks in-flight steps by span ID so we can update them on end.
	steps map[string]*dbmodels.AgentGraphRunStep
}

type RunTrackerOptions struct {
	RunID     string
	ProjectID string
}

// NewRunTracker creates a new run record and returns a tracker.
func NewRunTracker(
	db *gorm.DB,
	agentGraphID string,
	organizationID string,
	initialState map[string]any,
) (*RunTracker, error) {
	return NewRunTrackerWithOptions(
		db,
		agentGraphID,
		organizationID,
		initialState,
		RunTrackerOptions{},
	)
}

func NewRunTrackerWithOptions(
	db *gorm.DB,
	agentGraphID string,
	organizationID string,
	initialState map[string]any,
	options RunTrackerOptions,
) (*RunTracker, error) {
	run := &dbmodels.AgentGraphRun{
		AgentGraphID: agentGraphID,
		ProjectID:    toNullableString(options.ProjectID),
		Status:       "running",
	}
	if options.RunID != "" {
		run.ID = options.RunID
		if err := db.Select("id").Where("id = ? AND status = ?", options.RunID, "running").Take(run).Error; err != nil {
			return nil, fmt.Errorf("failed to find accepted running run: %w", err)
		}
	} else {
		stateJSON, err := json.Marshal(initialState)
		if err != nil {
			return nil, fmt.Errorf("failed to encode initial state: %w", err)
		}
		stateStr := string(stateJSON)
		run.InitialState = &stateStr
		if err := db.Create(run).Error; err != nil {
			return nil, fmt.Errorf("failed to create run record: %w", err)
		}
	}

	tracker := &RunTracker{
		db:             db,
		run:            run,
		organizationID: organizationID,
		steps:          make(map[string]*dbmodels.AgentGraphRunStep),
	}

	tracker.publish(realtime.DashboardReasonRunCreated)

	return tracker, nil
}

func toNullableString(value string) *string {
	if value == "" {
		return nil
	}

	return &value
}

// OnEvent implements graph.TraceHook.
func (t *RunTracker) OnEvent(_ context.Context, span *graph.TraceSpan) {
	switch span.Event {
	case graph.TraceEventNodeStart:
		order := t.stepOrder.Add(1)
		step := &dbmodels.AgentGraphRunStep{
			RunID:     t.run.ID,
			NodeKey:   span.NodeName,
			StepOrder: order,
			StartedAt: span.StartTime,
		}
		if err := t.db.Create(step).Error; err != nil {
			log.Printf(
				"graph run node_start db_write_failed run_id=%s step_order=%d node=%s err=%v",
				t.run.ID,
				order,
				span.NodeName,
				err,
			)
			return
		}
		t.mu.Lock()
		t.steps[span.ID] = step
		t.mu.Unlock()
		log.Printf(
			"graph run node_start run_id=%s step_order=%d node=%s",
			t.run.ID,
			order,
			span.NodeName,
		)
		t.publish(realtime.DashboardReasonRunStepChanged)

	case graph.TraceEventNodeEnd:
		t.mu.Lock()
		step, ok := t.steps[span.ID]
		if ok {
			delete(t.steps, span.ID)
		}
		t.mu.Unlock()
		if !ok {
			return
		}
		updates := map[string]any{"finished_at": span.EndTime}
		if span.State != nil {
			if deltaJSON, err := json.Marshal(span.State); err == nil {
				updates["state_delta"] = string(deltaJSON)
			}
		}
		if err := t.db.Model(step).Updates(updates).Error; err != nil {
			log.Printf(
				"graph run node_end db_write_failed run_id=%s step_order=%d node=%s err=%v",
				t.run.ID,
				step.StepOrder,
				step.NodeKey,
				err,
			)
		}
		log.Printf(
			"graph run node_end run_id=%s step_order=%d node=%s duration_ms=%d",
			t.run.ID,
			step.StepOrder,
			step.NodeKey,
			span.Duration.Milliseconds(),
		)
		t.publish(realtime.DashboardReasonRunStepChanged)

	case graph.TraceEventNodeError:
		t.mu.Lock()
		step, ok := t.steps[span.ID]
		if ok {
			delete(t.steps, span.ID)
		}
		t.mu.Unlock()
		updates := map[string]any{"finished_at": span.EndTime}
		errorPayload := map[string]any{}
		if span.Error != nil {
			errorPayload["error"] = span.Error.Error()
		}
		if span.State != nil {
			errorPayload["state"] = span.State
		}
		if len(errorPayload) > 0 {
			if payloadJSON, err := json.Marshal(errorPayload); err == nil {
				updates["state_delta"] = string(payloadJSON)
			}
		}
		if ok {
			if err := t.db.Model(step).Updates(updates).Error; err != nil {
				log.Printf(
					"graph run node_error db_write_failed run_id=%s step_order=%d node=%s err=%v",
					t.run.ID,
					step.StepOrder,
					step.NodeKey,
					err,
				)
			}
		}
		runErr := span.Error
		if span.Error != nil {
			runErr = span.Error
		} else {
			runErr = fmt.Errorf("node %s failed", span.NodeName)
		}
		stepOrder := int32(0)
		if ok {
			stepOrder = step.StepOrder
		}
		log.Printf(
			"graph run node_error run_id=%s step_order=%d node=%s duration_ms=%d",
			t.run.ID,
			stepOrder,
			span.NodeName,
			span.Duration.Milliseconds(),
		)
		if ok {
			t.publish(realtime.DashboardReasonRunStepChanged)
		}
		if _, err := FinalizeRun(t.db, t.run.ID, t.organizationID, "failed", span.State, runErr); err != nil {
			log.Printf("graph run failed db_write_failed run_id=%s err=%v", t.run.ID, err)
		}

	}
}

func terminalRunUpdates(status string, finalState any, runErr error) (map[string]any, error) {
	if status != "completed" && status != "failed" {
		return nil, fmt.Errorf("invalid terminal run status %q", status)
	}
	if status == "failed" && runErr == nil {
		return nil, fmt.Errorf("failed run requires an error")
	}

	updates := map[string]any{
		"status":      status,
		"finished_at": time.Now(),
		"error":       nil,
	}
	if runErr != nil {
		updates["error"] = runErr.Error()
	}
	if finalState != nil {
		stateJSON, err := json.Marshal(finalState)
		if err == nil {
			updates["final_state"] = string(stateJSON)
		}
	}

	return updates, nil
}

func updateRunningRun(db *gorm.DB, runID string, updates map[string]any) *gorm.DB {
	return db.Model(&dbmodels.AgentGraphRun{}).
		Where("id = ? AND status = ?", runID, "running").
		Updates(updates)
}

// FinalizeRun atomically transitions a running run once and publishes its terminal event.
func FinalizeRun(db *gorm.DB, runID string, organizationID string, status string, finalState any, runErr error) (bool, error) {
	updates, err := terminalRunUpdates(status, finalState, runErr)
	if err != nil {
		return false, err
	}

	tx := updateRunningRun(db, runID, updates)
	if tx.Error != nil {
		return false, tx.Error
	}
	if tx.RowsAffected == 0 {
		return false, nil
	}

	event := realtime.NewDashboardEvent(realtime.DashboardReasonRunFinished, organizationID)
	event.RunID = runID
	if err := publishDashboardEvent(context.Background(), event); err != nil {
		log.Printf(
			"graph run realtime_publish_failed run_id=%s reason=%s err=%v",
			runID,
			realtime.DashboardReasonRunFinished,
			err,
		)
	}

	return true, nil
}

// RunID returns the ID of the tracked run.
func (t *RunTracker) RunID() string {
	return t.run.ID
}

func (t *RunTracker) publish(reason string) {
	event := realtime.NewDashboardEvent(reason, t.organizationID)
	event.RunID = t.run.ID

	if err := publishDashboardEvent(context.Background(), event); err != nil {
		log.Printf(
			"graph run realtime_publish_failed run_id=%s reason=%s err=%v",
			t.run.ID,
			reason,
			err,
		)
	}
}
