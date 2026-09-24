package graphs

import (
	"encoding/json"
	"fmt"
	"unicode/utf8"
)

// MaxCheckpointedStateBytes keeps a run outcome under Inngest's 4 MiB step output limit,
// leaving room for the step response envelope.
const MaxCheckpointedStateBytes = 3 << 20

// MaxRunErrorBytes bounds failure messages, which can carry provider or tool output.
const MaxRunErrorBytes = 64 << 10

// RunOutcome is the serializable terminal result of a graph run. Jobs checkpoint it
// as step output so persisting it can be retried without executing the graph again.
type RunOutcome struct {
	Status     string         `json:"status"`
	FinalState map[string]any `json:"final_state,omitempty"`
	Error      string         `json:"error,omitempty"`
}

func CompletedRun(finalState map[string]any) RunOutcome {
	return RunOutcome{Status: "completed", FinalState: finalState}
}

func FailedRun(runErr error) RunOutcome {
	message := "graph run failed"
	if runErr != nil && runErr.Error() != "" {
		message = runErr.Error()
	}
	return RunOutcome{Status: "failed", Error: truncateRunError(message)}
}

func truncateRunError(message string) string {
	if len(message) <= MaxRunErrorBytes {
		return message
	}
	cut := MaxRunErrorBytes
	for cut > 0 && !utf8.RuneStart(message[cut]) {
		cut--
	}
	return fmt.Sprintf("%s… (truncated %d bytes)", message[:cut], len(message)-cut)
}

// GraphRunOutcome converts a graph invocation result into an outcome that can always
// be checkpointed. A state that cannot be encoded is omitted, and a state too large
// to checkpoint fails the run instead of leaving it unfinalized.
func GraphRunOutcome(finalState map[string]any, runErr error) RunOutcome {
	if runErr != nil {
		return FailedRun(runErr)
	}
	encoded, err := json.Marshal(finalState)
	if err != nil {
		return CompletedRun(nil)
	}
	if len(encoded) > MaxCheckpointedStateBytes {
		return FailedRun(fmt.Errorf(
			"graph final state is %d bytes, over the %d byte checkpoint limit",
			len(encoded),
			MaxCheckpointedStateBytes,
		))
	}
	return CompletedRun(finalState)
}
