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
	stateJSON, err := json.Marshal(initialState)
	if err != nil {
		return nil, fmt.Errorf("failed to encode initial state: %w", err)
	}
	stateStr := string(stateJSON)

	run := &dbmodels.AgentGraphRun{
		AgentGraphID: agentGraphID,
		ProjectID:    toNullableString(options.ProjectID),
		Status:       "running",
		InitialState: &stateStr,
	}
	if options.RunID != "" {
		run.ID = options.RunID
		now := time.Now()
		updates := map[string]any{
			"agent_graph_id": agentGraphID,
			"project_id":     toNullableString(options.ProjectID),
			"status":         "running",
			"initial_state":  stateStr,
			"error":          nil,
			"finished_at":    nil,
			"started_at":     now,
		}
		tx := db.Model(&dbmodels.AgentGraphRun{}).
			Where("id = ?", options.RunID).
			Updates(updates)
		if tx.Error != nil {
			return nil, fmt.Errorf("failed to update run record: %w", tx.Error)
		}
		if tx.RowsAffected == 0 {
			run.StartedAt = now
			if err := db.Create(run).Error; err != nil {
				return nil, fmt.Errorf("failed to create run record: %w", err)
			}
		} else {
			run.StartedAt = now
		}
	} else if err := db.Create(run).Error; err != nil {
		return nil, fmt.Errorf("failed to create run record: %w", err)
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
			"graph run node_end run_id=%s step_order=%d node=%s duration_ms=%d state_preview=%q",
			t.run.ID,
			step.StepOrder,
			step.NodeKey,
			span.Duration.Milliseconds(),
			previewState(span.State),
		)
		t.publish(realtime.DashboardReasonRunStepChanged)

	case graph.TraceEventNodeError:
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
		if err := t.db.Model(step).Updates(updates).Error; err != nil {
			log.Printf(
				"graph run node_error db_write_failed run_id=%s step_order=%d node=%s err=%v",
				t.run.ID,
				step.StepOrder,
				step.NodeKey,
				err,
			)
		}
		errText := "<nil>"
		if span.Error != nil {
			errText = span.Error.Error()
		}
		log.Printf(
			"graph run node_error run_id=%s step_order=%d node=%s duration_ms=%d error=%q state_preview=%q",
			t.run.ID,
			step.StepOrder,
			step.NodeKey,
			span.Duration.Milliseconds(),
			previewText(errText),
			previewState(span.State),
		)
		t.publish(realtime.DashboardReasonRunStepChanged)

	case graph.TraceEventGraphEnd:
		now := time.Now()
		if span.Error != nil {
			errStr := span.Error.Error()
			if err := t.db.Model(t.run).Updates(map[string]any{
				"status":      "failed",
				"error":       errStr,
				"finished_at": now,
			}).Error; err != nil {
				log.Printf(
					"graph run failed db_write_failed run_id=%s err=%v",
					t.run.ID,
					err,
				)
			}
			log.Printf(
				"graph run failed run_id=%s error=%q final_state_preview=%q",
				t.run.ID,
				previewText(errStr),
				previewState(span.State),
			)
			t.publish(realtime.DashboardReasonRunFinished)
		} else {
			updates := map[string]any{
				"status":      "completed",
				"finished_at": now,
			}
			if span.State != nil {
				if stateJSON, err := json.Marshal(span.State); err == nil {
					updates["final_state"] = string(stateJSON)
				}
			}
			if err := t.db.Model(t.run).Updates(updates).Error; err != nil {
				log.Printf(
					"graph run completed db_write_failed run_id=%s err=%v",
					t.run.ID,
					err,
				)
			}
			log.Printf(
				"graph run completed run_id=%s final_state_preview=%q",
				t.run.ID,
				previewState(span.State),
			)
			t.publish(realtime.DashboardReasonRunFinished)
		}
	}
}

// RunID returns the ID of the tracked run.
func (t *RunTracker) RunID() string {
	return t.run.ID
}

func (t *RunTracker) publish(reason string) {
	event := realtime.NewDashboardEvent(reason, t.organizationID)
	event.RunID = t.run.ID

	if err := realtime.PublishDashboardEvent(context.Background(), event); err != nil {
		log.Printf(
			"graph run realtime_publish_failed run_id=%s reason=%s err=%v",
			t.run.ID,
			reason,
			err,
		)
	}
}
