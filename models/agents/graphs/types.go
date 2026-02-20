package graphs

import (
	"context"

	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
)

// Snapshot is the normalized DB payload used to construct a LangGraph graph.
type Snapshot struct {
	AgentGraph *dbmodels.AgentGraph       `json:"agent_graph"`
	Nodes      []*SnapshotNode            `json:"nodes"`
	Edges      []*dbmodels.AgentGraphEdge `json:"edges"`
}

type SnapshotNode struct {
	Node  *dbmodels.AgentGraphNode `json:"node"`
	Model *dbmodels.Model          `json:"model,omitempty"`
	Tools []*dbmodels.Tool         `json:"tools,omitempty"`
}

type NodeToAdd struct {
	Name        string
	Description string
	Fn          func(ctx context.Context, state map[string]any) (map[string]any, error)
}
