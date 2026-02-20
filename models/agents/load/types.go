package load

import (
	"encoding/json"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
)

type DocumentAndAgentGraph struct {
	Document      *dbmodels.Document `json:"document"`
	GraphSnapshot *graphs.Snapshot   `json:"graph_snapshot"`
}

type DocumentAndAgentGraphRow struct {
	DocumentJSON   json.RawMessage `gorm:"column:document"`
	AgentGraphJSON json.RawMessage `gorm:"column:agent_graph"`
	NodesJSON      json.RawMessage `gorm:"column:agent_graph_nodes"`
	EdgesJSON      json.RawMessage `gorm:"column:agent_graph_edges"`
}
