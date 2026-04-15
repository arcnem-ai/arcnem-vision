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

type AgentGraphSnapshotRow struct {
	AgentGraphJSON json.RawMessage `gorm:"column:agent_graph"`
	NodesJSON      json.RawMessage `gorm:"column:agent_graph_nodes"`
	EdgesJSON      json.RawMessage `gorm:"column:agent_graph_edges"`
}

func LoadAgentGraphSnapshot(ctx context.Context, db *gorm.DB, agentGraphID uuid.UUID) (*graphs.Snapshot, error) {
	row := AgentGraphSnapshotRow{}
	tx := db.WithContext(ctx).
		Raw(loadAgentGraphSnapshotQuery(), agentGraphID).
		Scan(&row)
	if tx.Error != nil {
		return nil, tx.Error
	}
	if tx.RowsAffected == 0 {
		return nil, fmt.Errorf("workflow %s not found", agentGraphID)
	}

	agentGraph, err := decodeOptionalAgentGraphPayload(row.AgentGraphJSON)
	if err != nil {
		return nil, err
	}
	if agentGraph == nil {
		return nil, fmt.Errorf("workflow %s payload was empty", agentGraphID)
	}

	nodes, err := utils.DecodeJSONSlice[graphs.SnapshotNode](row.NodesJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to decode graph nodes payload: %w", err)
	}

	edges, err := utils.DecodeJSONSlice[dbmodels.AgentGraphEdge](row.EdgesJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to decode graph edges payload: %w", err)
	}

	return &graphs.Snapshot{
		AgentGraph: agentGraph,
		Nodes:      nodes,
		Edges:      edges,
	}, nil
}

func loadAgentGraphSnapshotQuery() string {
	return `
		SELECT
			jsonb_build_object(
				'id', ag.id,
				'name', ag.name,
				'description', ag.description,
				'entry_node', ag.entry_node,
				'state_schema', CASE
					WHEN ag.state_schema IS NULL THEN NULL
					ELSE ag.state_schema::text
				END,
				'agent_graph_template_id', ag.agent_graph_template_id,
				'agent_graph_template_version_id', ag.agent_graph_template_version_id,
				'organization_id', ag.organization_id
			) AS agent_graph,
			COALESCE(nodes.nodes, '[]'::jsonb) AS agent_graph_nodes,
			COALESCE(edges.edges, '[]'::jsonb) AS agent_graph_edges
		FROM agent_graphs ag
		LEFT JOIN LATERAL (
			SELECT jsonb_agg(
				jsonb_build_object(
					'node', jsonb_build_object(
						'id', n.id,
						'node_key', n.node_key,
						'node_type', n.node_type,
						'input_key', n.input_key,
						'output_key', n.output_key,
						'config', n.config::text,
						'agent_graph_id', n.agent_graph_id,
						'model_id', n.model_id
					),
					'model', CASE
						WHEN m.id IS NULL THEN NULL
						ELSE jsonb_build_object(
							'id', m.id,
							'provider', m.provider,
							'name', m.name,
							'type', m.type,
							'embedding_dim', m.embedding_dim,
							'version', m.version,
							'input_schema', CASE
								WHEN m.input_schema IS NULL THEN NULL
								ELSE m.input_schema::text
							END,
							'output_schema', CASE
								WHEN m.output_schema IS NULL THEN NULL
								ELSE m.output_schema::text
							END,
							'config', m.config::text
						)
					END,
					'tools', COALESCE(node_tools.tools, '[]'::jsonb)
				)
				ORDER BY n.node_key
			) AS nodes
			FROM agent_graph_nodes n
			LEFT JOIN models m ON m.id = n.model_id
			LEFT JOIN LATERAL (
				SELECT jsonb_agg(
					jsonb_build_object(
						'id', t.id,
						'name', t.name,
						'description', t.description,
						'input_schema', t.input_schema::text,
						'output_schema', t.output_schema::text
					)
					ORDER BY t.name, t.id
				) AS tools
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
		WHERE ag.id = ?
		LIMIT 1
	`
}
