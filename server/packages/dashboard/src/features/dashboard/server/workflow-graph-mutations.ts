import { schema } from "@arcnem-vision/db";
import { getDB } from "@arcnem-vision/db/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import type { WorkflowNodeConfig } from "@/features/dashboard/types";
import { requireOrganizationContext } from "./session-context";
import {
	normalizeGraphData,
	normalizeWorkflowFields,
} from "./workflow-normalization";

type WorkflowNodeInput = {
	id?: string;
	nodeKey: string;
	nodeType: string;
	x: number;
	y: number;
	inputKey?: string | null;
	outputKey?: string | null;
	modelId?: string | null;
	toolIds?: string[];
	config?: WorkflowNodeConfig;
};

type CreateWorkflowInput = {
	name: string;
	description?: string | null;
	entryNode: string;
	nodes: WorkflowNodeInput[];
	edges: Array<{
		fromNode: string;
		toNode: string;
	}>;
};

type UpdateWorkflowInput = {
	workflowId: string;
	name: string;
	description?: string | null;
	entryNode: string;
	nodes: WorkflowNodeInput[];
	edges: Array<{
		fromNode: string;
		toNode: string;
	}>;
};

type DBTransaction = Parameters<
	Parameters<ReturnType<typeof getDB>["transaction"]>[0]
>[0];

function buildNodeConfig(
	node: Pick<WorkflowNodeInput, "x" | "y" | "config">,
): Record<string, unknown> {
	const baseConfig =
		node.config &&
		typeof node.config === "object" &&
		!Array.isArray(node.config)
			? (node.config as WorkflowNodeConfig)
			: {};

	return {
		...baseConfig,
		uiPosition: {
			x: node.x,
			y: node.y,
		},
	};
}

async function assertGraphReferencesExist(
	tx: DBTransaction,
	graph: {
		nodes: Array<{
			modelId: string | null;
			toolIds: string[];
		}>;
	},
) {
	const referencedModelIds = Array.from(
		new Set(
			graph.nodes
				.map((node) => node.modelId)
				.filter((modelId): modelId is string => Boolean(modelId)),
		),
	);
	if (referencedModelIds.length > 0) {
		const modelRows = await tx
			.select({ id: schema.models.id })
			.from(schema.models)
			.where(inArray(schema.models.id, referencedModelIds));
		const foundModelIds = new Set(
			modelRows.map((row: { id: string }) => row.id),
		);
		const missingModelIds = referencedModelIds.filter(
			(modelId) => !foundModelIds.has(modelId),
		);
		if (missingModelIds.length > 0) {
			throw new Error(
				`Missing model references: ${missingModelIds.join(", ")}`,
			);
		}
	}

	const referencedToolIds = Array.from(
		new Set(graph.nodes.flatMap((node) => node.toolIds)),
	);
	if (referencedToolIds.length > 0) {
		const toolRows = await tx
			.select({ id: schema.tools.id })
			.from(schema.tools)
			.where(inArray(schema.tools.id, referencedToolIds));
		const foundToolIds = new Set(toolRows.map((row: { id: string }) => row.id));
		const missingToolIds = referencedToolIds.filter(
			(toolId) => !foundToolIds.has(toolId),
		);
		if (missingToolIds.length > 0) {
			throw new Error(`Missing tool references: ${missingToolIds.join(", ")}`);
		}
	}
}

export const createWorkflow = createServerFn({ method: "POST" })
	.inputValidator((input: CreateWorkflowInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const organizationId = await requireOrganizationContext();
		const fields = normalizeWorkflowFields(data);
		const graph = normalizeGraphData({
			entryNode: fields.entryNode,
			nodes: data.nodes,
			edges: data.edges,
		});

		const workflowId = await db.transaction(async (tx) => {
			await assertGraphReferencesExist(tx, graph);

			const [createdWorkflow] = await tx
				.insert(schema.agentGraphs)
				.values({
					name: fields.name,
					description: fields.description,
					entryNode: fields.entryNode,
					organizationId,
				})
				.returning({
					id: schema.agentGraphs.id,
				});

			if (!createdWorkflow) {
				throw new Error("Failed to create workflow.");
			}

			if (graph.nodes.length > 0) {
				const insertedNodes = await tx
					.insert(schema.agentGraphNodes)
					.values(
						graph.nodes.map((node) => ({
							nodeKey: node.nodeKey,
							nodeType: node.nodeType,
							inputKey: node.inputKey,
							outputKey: node.outputKey,
							modelId: node.modelId,
							config: buildNodeConfig(node),
							agentGraphId: createdWorkflow.id,
						})),
					)
					.returning({
						id: schema.agentGraphNodes.id,
						nodeKey: schema.agentGraphNodes.nodeKey,
					});

				const nodeIdByKey = new Map(
					insertedNodes.map((node) => [node.nodeKey, node.id]),
				);
				const nodeToolRows = graph.nodes.flatMap((node) => {
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

			if (graph.edges.length > 0) {
				await tx.insert(schema.agentGraphEdges).values(
					graph.edges.map((edge) => ({
						fromNode: edge.fromNode,
						toNode: edge.toNode,
						agentGraphId: createdWorkflow.id,
					})),
				);
			}

			return createdWorkflow.id;
		});

		return { id: workflowId };
	});

export const updateWorkflow = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateWorkflowInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const organizationId = await requireOrganizationContext();
		const fields = normalizeWorkflowFields(data);
		const graph = normalizeGraphData({
			entryNode: fields.entryNode,
			nodes: data.nodes,
			edges: data.edges,
		});

		await db.transaction(async (tx) => {
			const workflow = await tx.query.agentGraphs.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, data.workflowId),
						eq(row.organizationId, organizationId),
					),
				columns: { id: true },
			});
			if (!workflow) {
				throw new Error("Workflow not found in your organization.");
			}
			await assertGraphReferencesExist(tx, graph);

			const existingNodes = await tx.query.agentGraphNodes.findMany({
				where: (row, { eq }) => eq(row.agentGraphId, data.workflowId),
				columns: { id: true },
			});

			const existingNodeIds = new Set(existingNodes.map((node) => node.id));

			const submittedExistingIds = graph.nodes
				.filter((node) => Boolean(node.id))
				.map((node) => node.id as string);

			for (const nodeId of submittedExistingIds) {
				if (!existingNodeIds.has(nodeId)) {
					throw new Error("One of the nodes does not belong to this workflow.");
				}
			}

			const idsToDelete = Array.from(existingNodeIds).filter(
				(nodeId) => !submittedExistingIds.includes(nodeId),
			);
			if (idsToDelete.length > 0) {
				await tx
					.delete(schema.agentGraphNodes)
					.where(inArray(schema.agentGraphNodes.id, idsToDelete));
			}

			for (const node of graph.nodes) {
				if (!node.id) continue;
				await tx
					.update(schema.agentGraphNodes)
					.set({
						nodeKey: node.nodeKey,
						nodeType: node.nodeType,
						inputKey: node.inputKey,
						outputKey: node.outputKey,
						modelId: node.modelId,
						config: buildNodeConfig(node),
					})
					.where(
						and(
							eq(schema.agentGraphNodes.id, node.id),
							eq(schema.agentGraphNodes.agentGraphId, data.workflowId),
						),
					);
			}

			const nodesToCreate = graph.nodes.filter((node) => !node.id);
			if (nodesToCreate.length > 0) {
				await tx.insert(schema.agentGraphNodes).values(
					nodesToCreate.map((node) => ({
						nodeKey: node.nodeKey,
						nodeType: node.nodeType,
						inputKey: node.inputKey,
						outputKey: node.outputKey,
						modelId: node.modelId,
						config: buildNodeConfig(node),
						agentGraphId: data.workflowId,
					})),
				);
			}

			const latestNodes = await tx.query.agentGraphNodes.findMany({
				where: (row, { eq }) => eq(row.agentGraphId, data.workflowId),
				columns: {
					id: true,
					nodeKey: true,
				},
			});
			const latestNodeIdByKey = new Map(
				latestNodes.map((node) => [node.nodeKey, node.id]),
			);
			if (latestNodes.length > 0) {
				await tx.delete(schema.agentGraphNodeTools).where(
					inArray(
						schema.agentGraphNodeTools.agentGraphNodeId,
						latestNodes.map((node) => node.id),
					),
				);
			}

			const nextNodeToolRows = graph.nodes.flatMap((node) => {
				const nodeId = latestNodeIdByKey.get(node.nodeKey);
				if (!nodeId) return [];
				return node.toolIds.map((toolId) => ({
					agentGraphNodeId: nodeId,
					toolId,
				}));
			});
			if (nextNodeToolRows.length > 0) {
				await tx.insert(schema.agentGraphNodeTools).values(nextNodeToolRows);
			}

			await tx
				.delete(schema.agentGraphEdges)
				.where(eq(schema.agentGraphEdges.agentGraphId, data.workflowId));

			if (graph.edges.length > 0) {
				await tx.insert(schema.agentGraphEdges).values(
					graph.edges.map((edge) => ({
						fromNode: edge.fromNode,
						toNode: edge.toNode,
						agentGraphId: data.workflowId,
					})),
				);
			}

			await tx
				.update(schema.agentGraphs)
				.set({
					name: fields.name,
					description: fields.description,
					entryNode: fields.entryNode,
				})
				.where(
					and(
						eq(schema.agentGraphs.id, data.workflowId),
						eq(schema.agentGraphs.organizationId, organizationId),
					),
				);
		});

		return { id: data.workflowId };
	});
