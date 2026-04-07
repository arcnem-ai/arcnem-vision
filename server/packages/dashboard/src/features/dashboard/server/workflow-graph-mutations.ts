import { schema } from "@arcnem-vision/db";
import { getDB } from "@arcnem-vision/db/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import type {
	WorkflowNodeConfig,
	WorkflowTemplateVisibility,
} from "@/features/dashboard/types";
import { requireOrganizationContext } from "./session-context";
import {
	normalizeGraphData,
	normalizeWorkflowFields,
	parseCanvasPosition,
} from "./workflow-normalization";
import { buildWorkflowTemplateAccessCondition } from "./workflow-template-access";
import {
	createWorkflowTemplateSnapshot,
	normalizePersistedWorkflowNodeConfig,
	parseWorkflowTemplateSnapshot,
} from "./workflow-template-snapshot";
import {
	buildWorkflowNameFromTemplate,
	normalizeWorkflowTemplateVisibility,
} from "./workflow-template-utils";

type DatabaseTransaction = Parameters<
	Parameters<ReturnType<typeof getDB>["transaction"]>[0]
>[0];

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

type CreateWorkflowFromTemplateInput = {
	templateId: string;
};

type CreateWorkflowTemplateFromWorkflowInput = {
	workflowId: string;
	name: string;
	description?: string | null;
	visibility: WorkflowTemplateVisibility;
};

type UpdateWorkflowTemplateInput = {
	templateId: string;
	name: string;
	description?: string | null;
	entryNode: string;
	visibility: WorkflowTemplateVisibility;
	nodes: WorkflowNodeInput[];
	edges: Array<{
		fromNode: string;
		toNode: string;
	}>;
};

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

async function insertWorkflowGraphFromSnapshot(
	tx: DatabaseTransaction,
	input: {
		workflowId: string;
		snapshot: NonNullable<ReturnType<typeof parseWorkflowTemplateSnapshot>>;
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

export const createWorkflowFromTemplate = createServerFn({ method: "POST" })
	.inputValidator((input: CreateWorkflowFromTemplateInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const organizationId = await requireOrganizationContext();

		return db.transaction(async (tx) => {
			const template = await tx.query.agentGraphTemplates.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, data.templateId),
						buildWorkflowTemplateAccessCondition(row, organizationId),
					),
				columns: {
					id: true,
				},
				with: {
					currentVersion: {
						columns: {
							id: true,
							version: true,
							snapshot: true,
						},
					},
				},
			});

			if (!template) {
				throw new Error(
					"Workflow template not found or not shared with your organization.",
				);
			}
			if (!template.currentVersion) {
				throw new Error("Workflow template has no current version.");
			}

			const snapshot = parseWorkflowTemplateSnapshot(
				template.currentVersion.snapshot,
			);
			if (!snapshot) {
				throw new Error("Workflow template version is invalid.");
			}

			const existingWorkflowNames = await tx.query.agentGraphs.findMany({
				where: (row, { eq }) => eq(row.organizationId, organizationId),
				columns: {
					name: true,
				},
			});

			const workflowName = buildWorkflowNameFromTemplate(
				snapshot.name,
				existingWorkflowNames.map((workflow) => workflow.name),
			);

			const [createdWorkflow] = await tx
				.insert(schema.agentGraphs)
				.values({
					name: workflowName,
					description: snapshot.description,
					entryNode: snapshot.entryNode,
					stateSchema: snapshot.stateSchema,
					organizationId,
					agentGraphTemplateId: template.id,
					agentGraphTemplateVersionId: template.currentVersion.id,
				})
				.returning({
					id: schema.agentGraphs.id,
					name: schema.agentGraphs.name,
				});

			if (!createdWorkflow) {
				throw new Error("Failed to create workflow from template.");
			}

			await insertWorkflowGraphFromSnapshot(tx, {
				workflowId: createdWorkflow.id,
				snapshot,
			});

			return createdWorkflow;
		});
	});

export const createWorkflowTemplateFromWorkflow = createServerFn({
	method: "POST",
})
	.inputValidator((input: CreateWorkflowTemplateFromWorkflowInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const organizationId = await requireOrganizationContext();

		return db.transaction(async (tx) => {
			const sourceWorkflow = await tx.query.agentGraphs.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, data.workflowId),
						eq(row.organizationId, organizationId),
					),
				columns: {
					id: true,
					entryNode: true,
					stateSchema: true,
					name: true,
					description: true,
				},
				with: {
					agentGraphNodes: {
						columns: {
							nodeKey: true,
							nodeType: true,
							inputKey: true,
							outputKey: true,
							modelId: true,
							config: true,
						},
						with: {
							agentGraphNodeTools: {
								columns: {
									toolId: true,
								},
							},
						},
					},
					agentGraphEdges: {
						columns: {
							fromNode: true,
							toNode: true,
						},
					},
				},
			});

			if (!sourceWorkflow) {
				throw new Error("Workflow not found in your organization.");
			}

			const snapshot = createWorkflowTemplateSnapshot({
				name: data.name,
				description: data.description,
				entryNode: sourceWorkflow.entryNode,
				stateSchema: sourceWorkflow.stateSchema,
				nodes: sourceWorkflow.agentGraphNodes.map((node, index) => {
					const position = parseCanvasPosition(node.config, index);
					return {
						nodeKey: node.nodeKey,
						nodeType: node.nodeType,
						x: position.x,
						y: position.y,
						inputKey: node.inputKey,
						outputKey: node.outputKey,
						modelId: node.modelId,
						toolIds: node.agentGraphNodeTools.map(
							(toolLink) => toolLink.toolId,
						),
						config: normalizePersistedWorkflowNodeConfig(node.config),
					};
				}),
				edges: sourceWorkflow.agentGraphEdges.map((edge) => ({
					fromNode: edge.fromNode,
					toNode: edge.toNode,
				})),
			});
			const visibility = normalizeWorkflowTemplateVisibility(data.visibility);

			const [createdTemplate] = await tx
				.insert(schema.agentGraphTemplates)
				.values({
					visibility,
					organizationId,
				})
				.returning({
					id: schema.agentGraphTemplates.id,
				});

			if (!createdTemplate) {
				throw new Error("Failed to create workflow template.");
			}

			const [createdVersion] = await tx
				.insert(schema.agentGraphTemplateVersions)
				.values({
					agentGraphTemplateId: createdTemplate.id,
					version: 1,
					snapshot,
				})
				.returning({
					id: schema.agentGraphTemplateVersions.id,
					version: schema.agentGraphTemplateVersions.version,
				});

			if (!createdVersion) {
				throw new Error("Failed to create workflow template version.");
			}

			await tx
				.update(schema.agentGraphTemplates)
				.set({
					currentVersionId: createdVersion.id,
				})
				.where(eq(schema.agentGraphTemplates.id, createdTemplate.id));

			await tx
				.update(schema.agentGraphs)
				.set({
					agentGraphTemplateId: createdTemplate.id,
					agentGraphTemplateVersionId: createdVersion.id,
				})
				.where(
					and(
						eq(schema.agentGraphs.id, sourceWorkflow.id),
						eq(schema.agentGraphs.organizationId, organizationId),
					),
				);

			return {
				id: createdTemplate.id,
				name: snapshot.name,
				version: createdVersion.version,
			};
		});
	});

export const updateWorkflowTemplate = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateWorkflowTemplateInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const organizationId = await requireOrganizationContext();
		const visibility = normalizeWorkflowTemplateVisibility(data.visibility);

		return db.transaction(async (tx) => {
			const template = await tx.query.agentGraphTemplates.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, data.templateId),
						eq(row.organizationId, organizationId),
					),
				columns: {
					id: true,
				},
				with: {
					currentVersion: {
						columns: {
							id: true,
							version: true,
							snapshot: true,
						},
					},
				},
			});
			if (!template) {
				throw new Error("Template not found in your organization.");
			}
			const currentSnapshot = template.currentVersion
				? parseWorkflowTemplateSnapshot(template.currentVersion.snapshot)
				: null;
			if (!currentSnapshot) {
				throw new Error("Template has no valid current version.");
			}

			const latestVersion = await tx.query.agentGraphTemplateVersions.findFirst(
				{
					where: (row, { eq }) => eq(row.agentGraphTemplateId, data.templateId),
					columns: {
						version: true,
					},
					orderBy: (row, { desc }) => [desc(row.version)],
				},
			);
			const nextVersion = (latestVersion?.version ?? 0) + 1;
			const snapshot = createWorkflowTemplateSnapshot({
				name: data.name,
				description: data.description,
				entryNode: data.entryNode,
				stateSchema: currentSnapshot.stateSchema,
				nodes: data.nodes,
				edges: data.edges,
			});

			const [createdVersion] = await tx
				.insert(schema.agentGraphTemplateVersions)
				.values({
					agentGraphTemplateId: data.templateId,
					version: nextVersion,
					snapshot,
				})
				.returning({
					id: schema.agentGraphTemplateVersions.id,
				});

			if (!createdVersion) {
				throw new Error("Failed to create template version.");
			}

			await tx
				.update(schema.agentGraphTemplates)
				.set({
					currentVersionId: createdVersion.id,
					visibility,
				})
				.where(
					and(
						eq(schema.agentGraphTemplates.id, data.templateId),
						eq(schema.agentGraphTemplates.organizationId, organizationId),
					),
				);

			return {
				id: data.templateId,
				version: nextVersion,
			};
		});
	});
