import { schema } from "@arcnem-vision/db";
import {
	createWorkflowTemplateFromWorkflowInputSchema,
	createWorkflowTemplateSnapshot,
	normalizePersistedWorkflowNodeConfig,
	normalizeWorkflowTemplateVisibility,
	parseCanvasPosition,
	parseWorkflowTemplateSnapshot,
	updateWorkflowTemplateInputSchema,
} from "@arcnem-vision/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { readValidatedBody } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardWorkflowTemplatesRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardWorkflowTemplatesRouter.post(
	"/dashboard/workflow-templates/from-workflow",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(
			c,
			createWorkflowTemplateFromWorkflowInputSchema,
		);
		if (!parsed.ok) return parsed.response;

		const result = await c.get("dbClient").transaction(async (tx) => {
			const sourceWorkflow = await tx.query.agentGraphs.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, parsed.data.workflowId),
						eq(row.organizationId, access.context.organizationId),
					),
				columns: {
					id: true,
					entryNode: true,
					stateSchema: true,
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
				name: parsed.data.name,
				description: parsed.data.description,
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

			const [createdTemplate] = await tx
				.insert(schema.agentGraphTemplates)
				.values({
					visibility: normalizeWorkflowTemplateVisibility(
						parsed.data.visibility,
					),
					organizationId: access.context.organizationId,
				})
				.returning({ id: schema.agentGraphTemplates.id });
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
				.set({ currentVersionId: createdVersion.id })
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
						eq(
							schema.agentGraphs.organizationId,
							access.context.organizationId,
						),
					),
				);

			return {
				id: createdTemplate.id,
				name: snapshot.name,
				version: createdVersion.version,
			};
		});

		return c.json(result);
	},
);

dashboardWorkflowTemplatesRouter.post(
	"/dashboard/workflow-templates/update",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(
			c,
			updateWorkflowTemplateInputSchema,
		);
		if (!parsed.ok) return parsed.response;

		const result = await c.get("dbClient").transaction(async (tx) => {
			const template = await tx.query.agentGraphTemplates.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, parsed.data.templateId),
						eq(row.organizationId, access.context.organizationId),
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
					where: (row, { eq }) =>
						eq(row.agentGraphTemplateId, parsed.data.templateId),
					columns: { version: true },
					orderBy: (row, { desc }) => [desc(row.version)],
				},
			);
			const nextVersion = (latestVersion?.version ?? 0) + 1;
			const snapshot = createWorkflowTemplateSnapshot({
				name: parsed.data.name,
				description: parsed.data.description,
				entryNode: parsed.data.entryNode,
				stateSchema: currentSnapshot.stateSchema,
				nodes: parsed.data.nodes,
				edges: parsed.data.edges,
			});

			const [createdVersion] = await tx
				.insert(schema.agentGraphTemplateVersions)
				.values({
					agentGraphTemplateId: parsed.data.templateId,
					version: nextVersion,
					snapshot,
				})
				.returning({ id: schema.agentGraphTemplateVersions.id });
			if (!createdVersion) {
				throw new Error("Failed to create template version.");
			}

			await tx
				.update(schema.agentGraphTemplates)
				.set({
					currentVersionId: createdVersion.id,
					visibility: normalizeWorkflowTemplateVisibility(
						parsed.data.visibility,
					),
				})
				.where(
					and(
						eq(schema.agentGraphTemplates.id, parsed.data.templateId),
						eq(
							schema.agentGraphTemplates.organizationId,
							access.context.organizationId,
						),
					),
				);

			return {
				id: parsed.data.templateId,
				version: nextVersion,
			};
		});

		return c.json(result);
	},
);
