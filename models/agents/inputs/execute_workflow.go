package inputs

import "github.com/google/uuid"

type ExecuteWorkflowInput struct {
	ExecutionID  uuid.UUID      `json:"execution_id"`
	WorkflowID   uuid.UUID      `json:"workflow_id"`
	DocumentIDs  []uuid.UUID    `json:"document_ids,omitempty"`
	Scope        map[string]any `json:"scope,omitempty"`
	InitialState map[string]any `json:"initial_state,omitempty"`
}
