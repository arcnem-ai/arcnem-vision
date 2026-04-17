import { schema } from "@arcnem-vision/db";
import {
	buildWorkflowNameFromTemplate,
	createWorkflowFromTemplateInputSchema,
	createWorkflowInputSchema,
	createWorkflowTemplateSnapshot,
	generateWorkflowDraftInputSchema,
	normalizeGraphData,
	normalizeWorkflowFields,
	parseWorkflowTemplateSnapshot,
	updateWorkflowInputSchema,
} from "@arcnem-vision/shared";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { loadDashboardCatalog } from "@/lib/dashboard-state/catalog";
import { readValidatedBody } from "@/lib/request-validation";
import { generateWorkflowDraftFromDescription } from "@/lib/workflow-draft-generator";
import {
	buildNodeConfig,
	insertWorkflowGraphFromSnapshot,
} from "@/lib/workflow-graph-persistence";
import { buildWorkflowTemplateAccessCondition } from "@/lib/workflow-template-access";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardWorkflowRecordsRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardWorkflowRecordsRouter.post(
	"/dashboard/workflows/generate-draft",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, generateWorkflowDraftInputSchema);
		if (!parsed.ok) return parsed.response;

		try {
			const draft = await generateWorkflowDraftFromDescription({
				workflowDescription: parsed.data.workflowDescription,
				catalog: await loadDashboardCatalog(c.get("dbClient")),
			});

			return c.json({ draft });
		} catch (error) {
			return c.json(
				{
					message:
						error instanceof Error
							? error.message
							: "Failed to generate workflow draft.",
				},
				400,
			);
		}
	},
);

dashboardWorkflowRecordsRouter.post("/dashboard/workflows", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) return access.response;
	const parsed = await readValidatedBody(c, createWorkflowInputSchema);
	if (!parsed.ok) return parsed.response;

	const fields = normalizeWorkflowFields(parsed.data);
	const workflowId = await c.get("dbClient").transaction(async (tx) => {
		const [createdWorkflow] = await tx
			.insert(schema.agentGraphs)
			.values({
				name: fields.name,
				description: fields.description ?? "",
				entryNode: fields.entryNode,
				organizationId: access.context.organizationId,
			})
			.returning({ id: schema.agentGraphs.id });
		if (!createdWorkflow) {
			throw new Error("Failed to create workflow.");
		}

		await insertWorkflowGraphFromSnapshot(tx, {
			workflowId: createdWorkflow.id,
			snapshot: createWorkflowTemplateSnapshot(parsed.data),
		});

		return createdWorkflow.id;
	});

	return c.json({ id: workflowId });
});

dashboardWorkflowRecordsRouter.post(
	"/dashboard/workflows/update",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, updateWorkflowInputSchema);
		if (!parsed.ok) return parsed.response;

		const db = c.get("dbClient");
		const fields = normalizeWorkflowFields(parsed.data);
		const graph = normalizeGraphData(parsed.data);

		await db.transaction(async (tx) => {
			const workflow = await tx.query.agentGraphs.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, parsed.data.workflowId),
						eq(row.organizationId, access.context.organizationId),
					),
				columns: { id: true },
			});
			if (!workflow) {
				throw new Error("Workflow not found in your organization.");
			}

			const existingNodes = await tx.query.agentGraphNodes.findMany({
				where: (row, { eq }) => eq(row.agentGraphId, parsed.data.workflowId),
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
							eq(schema.agentGraphNodes.agentGraphId, parsed.data.workflowId),
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
						agentGraphId: parsed.data.workflowId,
					})),
				);
			}

			const latestNodes = await tx.query.agentGraphNodes.findMany({
				where: (row, { eq }) => eq(row.agentGraphId, parsed.data.workflowId),
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
				.where(eq(schema.agentGraphEdges.agentGraphId, parsed.data.workflowId));
			if (graph.edges.length > 0) {
				await tx.insert(schema.agentGraphEdges).values(
					graph.edges.map((edge) => ({
						fromNode: edge.fromNode,
						toNode: edge.toNode,
						agentGraphId: parsed.data.workflowId,
					})),
				);
			}

			await tx
				.update(schema.agentGraphs)
				.set({
					name: fields.name,
					description: fields.description ?? "",
					entryNode: fields.entryNode,
				})
				.where(
					and(
						eq(schema.agentGraphs.id, parsed.data.workflowId),
						eq(
							schema.agentGraphs.organizationId,
							access.context.organizationId,
						),
					),
				);
		});

		return c.json({ id: parsed.data.workflowId });
	},
);

dashboardWorkflowRecordsRouter.post(
	"/dashboard/workflows/from-template",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(
			c,
			createWorkflowFromTemplateInputSchema,
		);
		if (!parsed.ok) return parsed.response;

		const result = await c.get("dbClient").transaction(async (tx) => {
			const template = await tx.query.agentGraphTemplates.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, parsed.data.templateId),
						buildWorkflowTemplateAccessCondition(
							row,
							access.context.organizationId,
						),
					),
				columns: { id: true },
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
				where: (row, { eq }) =>
					eq(row.organizationId, access.context.organizationId),
				columns: { name: true },
			});
			const workflowName = buildWorkflowNameFromTemplate(
				snapshot.name,
				existingWorkflowNames.map((workflow) => workflow.name),
			);

			const [createdWorkflow] = await tx
				.insert(schema.agentGraphs)
				.values({
					name: workflowName,
					description: snapshot.description ?? "",
					entryNode: snapshot.entryNode,
					stateSchema: snapshot.stateSchema,
					organizationId: access.context.organizationId,
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

		return c.json(result);
	},
);
