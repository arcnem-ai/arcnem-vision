import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	createWorkflowInputSchema,
	normalizeGraphData,
	normalizePersistedWorkflowNodeConfig,
	normalizeWorkflowFields,
	normalizeWorkflowStateSchema,
	parseCanvasPosition,
	updateWorkflowInputSchema,
} from "@arcnem-vision/shared";
import { and, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { loadDashboardCatalog } from "./dashboard-state/catalog";
import { ServiceError } from "./service-error";
import { getCompatibleWorkerModels } from "./workflow-draft-generator/catalog";
import {
	buildNodeConfig,
	insertWorkflowGraphFromSnapshot,
} from "./workflow-graph-persistence";

type WorkflowAccess = { userId: string; organizationId: string };
type DatabaseTransaction = Parameters<Parameters<PGDB["transaction"]>[0]>[0];

// Keep PostgreSQL microseconds: JavaScript Date would truncate the edit revision.
const revision = sql<string>`${schema.agentGraphs.updatedAt}::text`;

async function requireWorkflowMembership(
	db: PGDB | DatabaseTransaction,
	access: WorkflowAccess,
) {
	const membership = await db.query.members.findFirst({
		where: (row, { and, eq }) =>
			and(
				eq(row.userId, access.userId),
				eq(row.organizationId, access.organizationId),
			),
		columns: { id: true },
	});
	if (!membership)
		throw new ServiceError(403, "Organization membership is required.");
}

function normalizeWorkflowDefinition(
	input: z.infer<typeof createWorkflowInputSchema>,
) {
	try {
		const fields = normalizeWorkflowFields(input);
		const graph = normalizeGraphData({ ...input, entryNode: fields.entryNode });
		return { ...fields, ...graph, stateSchema: input.stateSchema ?? null };
	} catch (error) {
		throw new ServiceError(
			400,
			error instanceof Error ? error.message : "Invalid workflow definition.",
		);
	}
}

async function validateWorkflowCatalog(
	db: PGDB,
	nodes: Array<
		Omit<ReturnType<typeof normalizeGraphData>["nodes"][number], "id">
	>,
) {
	const catalog = await loadDashboardCatalog(db);
	const modelIds = new Set(
		getCompatibleWorkerModels(catalog.modelCatalog).map((model) => model.id),
	);
	const toolIds = new Set(catalog.toolCatalog.map((tool) => tool.id));
	for (const node of nodes) {
		workflowNodeConfigSchemas[
			node.nodeType as keyof typeof workflowNodeConfigSchemas
		].parse(node.config);
		if (node.modelId && !modelIds.has(node.modelId)) {
			throw new ServiceError(
				400,
				`Node "${node.nodeKey}" must select a compatible worker model from get_workflow_catalog.`,
			);
		}
		for (const toolId of node.toolIds) {
			if (!toolIds.has(toolId))
				throw new ServiceError(
					400,
					`Node "${node.nodeKey}" references an unknown tool.`,
				);
		}
	}
}

export async function listWorkflows(
	db: PGDB,
	organizationId: string,
	input: {
		limit?: number;
		offset?: number;
		includeArchived?: boolean;
		query?: string;
	} = {},
) {
	const limit = Math.min(100, Math.max(1, input.limit ?? 25));
	const offset = Math.max(0, input.offset ?? 0);
	const workflows = await db.query.agentGraphs.findMany({
		where: (row) =>
			and(
				eq(row.organizationId, organizationId),
				input.includeArchived ? undefined : isNull(row.archivedAt),
				input.query ? ilike(row.name, `%${input.query}%`) : undefined,
			),
		columns: {
			id: true,
			name: true,
			description: true,
			entryNode: true,
			archivedAt: true,
		},
		extras: { revision: revision.as("revision") },
		orderBy: (row, { asc }) => [asc(row.name), asc(row.id)],
		limit: limit + 1,
		offset,
	});
	return {
		workflows: workflows.slice(0, limit),
		nextOffset: workflows.length > limit ? offset + limit : null,
	};
}

export async function getWorkflow(
	db: PGDB,
	organizationId: string,
	workflowId: string,
) {
	const workflow = await db.query.agentGraphs.findFirst({
		where: (row, { and, eq }) =>
			and(eq(row.id, workflowId), eq(row.organizationId, organizationId)),
		columns: {
			id: true,
			organizationId: true,
			name: true,
			description: true,
			entryNode: true,
			stateSchema: true,
			archivedAt: true,
		},
		extras: { revision: revision.as("revision") },
		with: {
			agentGraphNodes: {
				columns: {
					id: true,
					nodeKey: true,
					nodeType: true,
					inputKey: true,
					outputKey: true,
					modelId: true,
					config: true,
				},
				with: { agentGraphNodeTools: { columns: { toolId: true } } },
				orderBy: (row, { asc }) => [asc(row.createdAt), asc(row.id)],
			},
			agentGraphEdges: {
				columns: { fromNode: true, toNode: true },
				orderBy: (row, { asc }) => [asc(row.fromNode), asc(row.toNode)],
			},
		},
	});
	if (!workflow)
		throw new ServiceError(404, "Workflow not found in your organization.");
	return {
		id: workflow.id,
		organizationId: workflow.organizationId,
		revision: workflow.revision,
		archivedAt: workflow.archivedAt,
		definition: {
			name: workflow.name,
			description: workflow.description ?? "",
			entryNode: workflow.entryNode,
			stateSchema: createWorkflowInputSchema.shape.stateSchema.parse(
				normalizeWorkflowStateSchema(workflow.stateSchema),
			),
			nodes: workflow.agentGraphNodes.map((node, index) => ({
				id: node.id,
				nodeKey: node.nodeKey,
				nodeType: node.nodeType,
				...parseCanvasPosition(node.config, index),
				inputKey: node.inputKey,
				outputKey: node.outputKey,
				modelId: node.modelId,
				toolIds: node.agentGraphNodeTools.map((link) => link.toolId),
				config: normalizePersistedWorkflowNodeConfig(node.config),
			})),
			edges: workflow.agentGraphEdges,
		},
	};
}

export async function createWorkflow(
	db: PGDB,
	access: WorkflowAccess,
	rawInput: z.input<typeof createWorkflowInputSchema>,
) {
	const input = createWorkflowInputSchema.parse(rawInput);
	await requireWorkflowMembership(db, access);
	const snapshot = normalizeWorkflowDefinition(input);
	await validateWorkflowCatalog(db, snapshot.nodes);
	return db.transaction(async (tx) => {
		await requireWorkflowMembership(tx, access);
		const [workflow] = await tx
			.insert(schema.agentGraphs)
			.values({
				name: snapshot.name,
				description: snapshot.description ?? "",
				entryNode: snapshot.entryNode,
				stateSchema: snapshot.stateSchema,
				organizationId: access.organizationId,
			})
			.returning({ id: schema.agentGraphs.id, revision });
		if (!workflow) throw new Error("Failed to create workflow.");
		await insertWorkflowGraphFromSnapshot(tx, {
			workflowId: workflow.id,
			snapshot,
		});
		return workflow;
	});
}

export async function updateWorkflow(
	db: PGDB,
	access: WorkflowAccess,
	rawInput: z.input<typeof updateWorkflowInputSchema>,
) {
	const input = updateWorkflowInputSchema.parse(rawInput);
	await requireWorkflowMembership(db, access);
	const graph = normalizeWorkflowDefinition(input);
	const fields = graph;
	await validateWorkflowCatalog(db, graph.nodes);
	return db.transaction(async (tx) => {
		await requireWorkflowMembership(tx, access);
		const [workflow] = await tx
			.select({ id: schema.agentGraphs.id, revision })
			.from(schema.agentGraphs)
			.where(
				and(
					eq(schema.agentGraphs.id, input.workflowId),
					eq(schema.agentGraphs.organizationId, access.organizationId),
				),
			)
			.for("update");
		if (!workflow)
			throw new ServiceError(404, "Workflow not found in your organization.");
		if (
			input.expectedRevision !== undefined &&
			workflow.revision !== input.expectedRevision
		) {
			throw new ServiceError(
				409,
				"Workflow changed since it was read. Read get_workflow again, then reapply your edits using the new revision.",
			);
		}
		const existingNodes = await tx.query.agentGraphNodes.findMany({
			where: (row, { eq }) => eq(row.agentGraphId, input.workflowId),
			columns: { id: true },
		});
		const existingNodeIds = new Set(existingNodes.map((node) => node.id));
		const submittedExistingIds = graph.nodes
			.filter((node) => Boolean(node.id))
			.map((node) => node.id as string);
		for (const nodeId of submittedExistingIds) {
			if (!existingNodeIds.has(nodeId)) {
				throw new ServiceError(
					400,
					"One of the nodes does not belong to this workflow.",
				);
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

		// Move retained keys outside the valid key alphabet so key swaps cannot
		// collide with the unique (graph, node_key) constraint mid-transaction.
		if (submittedExistingIds.length > 0) {
			await tx
				.update(schema.agentGraphNodes)
				.set({ nodeKey: sql`'/' || ${schema.agentGraphNodes.id}::text` })
				.where(
					and(
						eq(schema.agentGraphNodes.agentGraphId, input.workflowId),
						inArray(schema.agentGraphNodes.id, submittedExistingIds),
					),
				);
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
						eq(schema.agentGraphNodes.agentGraphId, input.workflowId),
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
					agentGraphId: input.workflowId,
				})),
			);
		}

		const latestNodes = await tx.query.agentGraphNodes.findMany({
			where: (row, { eq }) => eq(row.agentGraphId, input.workflowId),
			columns: { id: true, nodeKey: true },
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
			.where(eq(schema.agentGraphEdges.agentGraphId, input.workflowId));
		if (graph.edges.length > 0) {
			await tx.insert(schema.agentGraphEdges).values(
				graph.edges.map((edge) => ({
					fromNode: edge.fromNode,
					toNode: edge.toNode,
					agentGraphId: input.workflowId,
				})),
			);
		}
		const [updated] = await tx
			.update(schema.agentGraphs)
			.set({
				name: fields.name,
				description: fields.description ?? "",
				entryNode: fields.entryNode,
				...(input.stateSchema !== undefined
					? { stateSchema: input.stateSchema }
					: {}),
				updatedAt: sql`greatest(clock_timestamp()::timestamp, ${schema.agentGraphs.updatedAt} + interval '1 microsecond')`,
			})
			.where(
				and(
					eq(schema.agentGraphs.id, input.workflowId),
					eq(schema.agentGraphs.organizationId, access.organizationId),
				),
			)
			.returning({ id: schema.agentGraphs.id, revision });
		if (!updated) throw new Error("Failed to update workflow.");
		return updated;
	});
}

// These fields mirror the Go graph runtime. Arbitrary config keys survive graph edits.
const generationConfig = {
	reasoning_effort: z
		.enum(["", "none", "minimal", "low", "medium", "high", "xhigh", "max"])
		.optional(),
	max_output_tokens: z.number().int().nonnegative().optional(),
	max_iterations: z.number().int().nonnegative().optional(),
	input_mode: z.enum(["", "image_url"]).optional(),
	input_prompt: z.string().optional(),
};
const workflowNodeConfigSchemas = {
	worker: z.looseObject({
		...generationConfig,
		system_message: z.string().optional(),
		output_retries: z.number().int().nonnegative().optional(),
		output_schema: z.record(z.string(), z.unknown()).optional(),
	}),
	supervisor: z.looseObject({
		...generationConfig,
		members: z.array(z.string()).min(1),
		finish_target: z.string().optional(),
		timeout_seconds: z.number().int().nonnegative().optional(),
	}),
	condition: z.looseObject({
		source_key: z.string(),
		operator: z.enum(["equals", "contains"]),
		value: z.string(),
		case_sensitive: z.boolean().optional(),
		true_target: z.string(),
		false_target: z.string(),
	}),
	tool: z.looseObject({
		input_mapping: z.record(z.string(), z.unknown()).optional(),
		output_mapping: z.record(z.string(), z.string()).optional(),
	}),
};

export async function getWorkflowCatalog(db: PGDB) {
	const catalog = await loadDashboardCatalog(db);
	return {
		models: getCompatibleWorkerModels(catalog.modelCatalog),
		processingModels: catalog.executionModelCatalog,
		tools: catalog.toolCatalog,
		nodeTypes: Object.entries(workflowNodeConfigSchemas).map(
			([nodeType, configSchema]) => ({
				nodeType,
				requiresModel: nodeType === "worker" || nodeType === "supervisor",
				requiresTools: nodeType === "tool",
				toolCount: nodeType === "tool" ? 1 : 0,
				configSchema: z.toJSONSchema(configSchema),
			}),
		),
		stateSchema: {
			description:
				"Map state keys to append or overwrite reducers. Null uses default state merging.",
			values: ["append", "overwrite"],
		},
		mapping: {
			input_mapping:
				"Tool argument to state key. Strings name state keys; prefix literal strings with _const:. Objects and arrays resolve these same rules recursively, including input_params. Numbers, booleans and null are constants.",
			output_mapping: "Tool result field to destination state key.",
		},
	};
}
