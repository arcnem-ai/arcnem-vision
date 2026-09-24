package jobs

import (
	"context"
	"errors"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	"github.com/inngest/inngestgo"
	"github.com/inngest/inngestgo/step"
	"gorm.io/gorm"
)

var finalizeRun = graphs.FinalizeRun

// finishRun persists a checkpointed run outcome in its own step. Persistence errors
// stay retryable, so Inngest retries the write without executing the graph again.
func finishRun(ctx context.Context, db *gorm.DB, runID string, organizationID string, outcome graphs.RunOutcome) (map[string]any, error) {
	if _, err := step.Run(ctx, "finalize-run", func(ctx context.Context) (bool, error) {
		return finalizeRun(db, runID, organizationID, outcome)
	}); err != nil {
		return nil, err
	}
	if outcome.Status == "failed" {
		return nil, inngestgo.NoRetryError(errors.New(outcome.Error))
	}

	return outcome.FinalState, nil
}
