package load

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/arcnem-ai/arcnem-vision/models/agents/graphs"
	"github.com/arcnem-ai/arcnem-vision/models/agents/utils"
	dbmodels "github.com/arcnem-ai/arcnem-vision/models/db/gen/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func LoadDocumentAndAgentGraph(ctx context.Context, db *gorm.DB, documentID uuid.UUID) (*DocumentAndAgentGraph, error) {
	row := DocumentAndAgentGraphRow{}
	tx := db.WithContext(ctx).Raw(`
		SELECT
			(to_jsonb(d) - 'last_modified_at' - 'created_at' - 'updated_at') AS document,
			(to_jsonb(ag) - 'created_at' - 'updated_at') AS agent_graph,
			COALESCE(nodes.nodes, '[]'::jsonb) AS agent_graph_nodes,
			COALESCE(edges.edges, '[]'::jsonb) AS agent_graph_edges
		FROM documents d
		INNER JOIN devices dev ON dev.id = d.device_id
		LEFT JOIN agent_graphs ag ON ag.id = dev.agent_graph_id
		LEFT JOIN LATERAL (
			SELECT jsonb_agg(
				json_build_object(
					'node', (to_jsonb(n) - 'created_at' - 'updated_at'),
					'model', (to_jsonb(m) - 'created_at' - 'updated_at'),
					'tools', COALESCE(node_tools.tools, '[]'::jsonb)
				)
				ORDER BY n.node_key
			) AS nodes
			FROM agent_graph_nodes n
			LEFT JOIN models m ON m.id = n.model_id
			LEFT JOIN LATERAL (
				SELECT jsonb_agg((to_jsonb(t) - 'created_at' - 'updated_at') ORDER BY t.name, t.id) AS tools
				FROM agent_graph_node_tools nt
				INNER JOIN tools t ON t.id = nt.tool_id
				WHERE nt.agent_graph_node_id = n.id
			) node_tools ON TRUE
			WHERE n.agent_graph_id = ag.id
		) nodes ON TRUE
		LEFT JOIN LATERAL (
			SELECT jsonb_agg((to_jsonb(e) - 'created_at' - 'updated_at') ORDER BY e.from_node, e.to_node) AS edges
			FROM agent_graph_edges e
			WHERE e.agent_graph_id = ag.id
		) edges ON TRUE
		WHERE d.id = ?
		LIMIT 1
	`, documentID).Scan(&row)
	if tx.Error != nil {
		return nil, tx.Error
	}
	if tx.RowsAffected == 0 {
		return nil, fmt.Errorf("document %s not found or has no related device", documentID)
	}

	document := &dbmodels.Document{}
	if err := json.Unmarshal(row.DocumentJSON, document); err != nil {
		return nil, fmt.Errorf("failed to decode document payload: %w", err)
	}

	var agentGraph *dbmodels.AgentGraph
	if len(row.AgentGraphJSON) > 0 && string(row.AgentGraphJSON) != "null" {
		agentGraph = &dbmodels.AgentGraph{}
		if err := json.Unmarshal(row.AgentGraphJSON, agentGraph); err != nil {
			return nil, fmt.Errorf("failed to decode agent graph payload: %w", err)
		}
	}

	nodes, err := utils.DecodeJSONSlice[graphs.SnapshotNode](row.NodesJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to decode graph nodes payload: %w", err)
	}

	edges, err := utils.DecodeJSONSlice[dbmodels.AgentGraphEdge](row.EdgesJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to decode graph edges payload: %w", err)
	}

	return &DocumentAndAgentGraph{
		Document: document,
		GraphSnapshot: &graphs.Snapshot{
			AgentGraph: agentGraph,
			Nodes:      nodes,
			Edges:      edges,
		},
	}, nil
}
