import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import type { WorkflowTemplateSnapshot } from "@arcnem-vision/shared";

type DatabaseTransaction = Parameters<Parameters<PGDB["transaction"]>[0]>[0];

export function buildNodeConfig(node: {
	x: number;
	y: number;
	config?: Record<string, unknown>;
}) {
	const baseConfig =
		node.config &&
		typeof node.config === "object" &&
		!Array.isArray(node.config)
			? node.config
			: {};

	return {
		...baseConfig,
		uiPosition: {
			x: node.x,
			y: node.y,
		},
	};
}

export async function insertWorkflowGraphFromSnapshot(
	tx: DatabaseTransaction,
	input: {
		workflowId: string;
		snapshot: WorkflowTemplateSnapshot;
	},
) {
	if (input.snapshot.nodes.length > 0) {
		const insertedNodes = await tx
			.insert(schema.agentGraphNodes)
			.values(
				input.snapshot.nodes.map((node) => ({
					nodeKey: node.nodeKey,
					nodeType: node.nodeType,
					inputKey: node.inputKey,
					outputKey: node.outputKey,
					modelId: node.modelId,
					config: buildNodeConfig(node),
					agentGraphId: input.workflowId,
				})),
			)
			.returning({
				id: schema.agentGraphNodes.id,
				nodeKey: schema.agentGraphNodes.nodeKey,
			});

		const nodeIdByKey = new Map(
			insertedNodes.map((node) => [node.nodeKey, node.id]),
		);
		const nodeToolRows = input.snapshot.nodes.flatMap((node) => {
			const nodeId = nodeIdByKey.get(node.nodeKey);
			if (!nodeId) return [];
			return node.toolIds.map((toolId) => ({
				agentGraphNodeId: nodeId,
				toolId,
			}));
		});
		if (nodeToolRows.length > 0) {
			await tx.insert(schema.agentGraphNodeTools).values(nodeToolRows);
		}
	}

	if (input.snapshot.edges.length > 0) {
		await tx.insert(schema.agentGraphEdges).values(
			input.snapshot.edges.map((edge) => ({
				fromNode: edge.fromNode,
				toNode: edge.toNode,
				agentGraphId: input.workflowId,
			})),
		);
	}
}
