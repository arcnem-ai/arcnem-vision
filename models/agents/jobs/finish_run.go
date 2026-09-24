package jobs

import (
	"context"
	"errors"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	"github.com/inngest/inngestgo"
	"github.com/inngest/inngestgo/step"
	"gorm.io/gorm"
)

const webhookDeliveryRequestedEvent = "webhook/delivery.requested"

var finalizeRun = graphs.FinalizeRun

var requestWebhookDeliveries = func(ctx context.Context, deliveries []graphs.WebhookDispatch) error {
	events := make([]inngestgo.GenericEvent[map[string]any], len(deliveries))
	for i, delivery := range deliveries {
		// The event ID dedupes a repeated send of the same dispatch.
		eventID := "webhook-dispatch-" + delivery.DispatchID
		events[i] = inngestgo.GenericEvent[map[string]any]{
			ID:   &eventID,
			Name: webhookDeliveryRequestedEvent,
			Data: map[string]any{
				"deliveryId": delivery.DeliveryID,
				"dispatchId": delivery.DispatchID,
			},
		}
	}
	_, err := step.SendMany(ctx, "request-webhook-deliveries", events)
	return err
}

// finishRun persists a checkpointed run outcome in its own step, then requests the
// run's pending webhook deliveries. Both steps are retried by Inngest on their own,
// so neither a database error nor a failed send executes the graph again. A replayed
// finalize step returns the deliveries its committed transaction queued.
func finishRun(ctx context.Context, db *gorm.DB, runID string, organizationID string, outcome graphs.RunOutcome) (map[string]any, error) {
	deliveries, err := step.Run(ctx, "finalize-run", func(ctx context.Context) ([]graphs.WebhookDispatch, error) {
		result, err := finalizeRun(db, runID, organizationID, outcome)
		return result.Deliveries, err
	})
	if err != nil {
		return nil, err
	}
	if len(deliveries) > 0 {
		if err := requestWebhookDeliveries(ctx, deliveries); err != nil {
			return nil, err
		}
	}
	if outcome.Status == "failed" {
		return nil, inngestgo.NoRetryError(errors.New(outcome.Error))
	}

	return outcome.FinalState, nil
}
