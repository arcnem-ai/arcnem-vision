package load

import (
	"fmt"

	"github.com/google/uuid"
)

type documentAndAgentGraphQuerySpec struct {
	graphJoin string
	args      []any
}

func buildDocumentAndAgentGraphQuerySpec(documentID uuid.UUID, agentGraphID *uuid.UUID) documentAndAgentGraphQuerySpec {
	spec := documentAndAgentGraphQuerySpec{
		graphJoin: "LEFT JOIN apikeys ak ON ak.id = d.api_key_id LEFT JOIN agent_graphs ag ON ag.id = ak.agent_graph_id",
		args:      []any{documentID},
	}

	if agentGraphID != nil {
		spec.graphJoin = "INNER JOIN agent_graphs ag ON ag.id = ? AND ag.organization_id = d.organization_id"
		spec.args = []any{*agentGraphID, documentID}
	}

	return spec
}

func loadDocumentAndAgentGraphQuery(graphJoin string) string {
	return fmt.Sprintf(`
		SELECT
			(to_jsonb(d) - 'last_modified_at' - 'created_at' - 'updated_at') AS document,
			CASE
				WHEN ag.id IS NULL THEN NULL
				ELSE jsonb_build_object(
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
				)
			END AS agent_graph,
			COALESCE(nodes.nodes, '[]'::jsonb) AS agent_graph_nodes,
			COALESCE(edges.edges, '[]'::jsonb) AS agent_graph_edges
		FROM documents d
		%s
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
		WHERE d.id = ?
		LIMIT 1
	`, graphJoin)
}
