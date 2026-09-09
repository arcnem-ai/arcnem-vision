import { schema } from "@arcnem-vision/db";
import {
	buildWorkflowNameFromTemplate,
	createWorkflowFromTemplateInputSchema,
	createWorkflowInputSchema,
	generateWorkflowDraftInputSchema,
	parseWorkflowTemplateSnapshot,
	setWorkflowArchivedInputSchema,
	updateWorkflowInputSchema,
} from "@arcnem-vision/shared";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { loadDashboardCatalog } from "@/lib/dashboard-state/catalog";
import { readValidatedBody } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";
import { generateWorkflowDraftFromDescription } from "@/lib/workflow-draft-generator";
import { insertWorkflowGraphFromSnapshot } from "@/lib/workflow-graph-persistence";
import { createWorkflow, updateWorkflow } from "@/lib/workflow-operations";
import { buildWorkflowTemplateAccessCondition } from "@/lib/workflow-template-access";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardWorkflowRecordsRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardWorkflowRecordsRouter.onError((error, c) => {
	if (error instanceof ServiceError)
		return c.json({ message: error.message }, error.status);
	if (error instanceof z.ZodError)
		return c.json(
			{ message: error.issues[0]?.message ?? "Invalid workflow definition." },
			400,
		);
	throw error;
});

dashboardWorkflowRecordsRouter.post(
	"/dashboard/workflows/archive",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, setWorkflowArchivedInputSchema);
		if (!parsed.ok) return parsed.response;

		const db = c.get("dbClient");
		const workflow = await db.query.agentGraphs.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, parsed.data.workflowId),
					eq(row.organizationId, access.context.organizationId),
				),
			columns: {
				id: true,
				name: true,
				archivedAt: true,
			},
		});
		if (!workflow) {
			return c.json(
				{ message: "Workflow not found in your organization." },
				404,
			);
		}

		const timestamp = parsed.data.archived
			? (workflow.archivedAt ?? new Date())
			: null;

		const [updatedWorkflow] = await db
			.update(schema.agentGraphs)
			.set({
				archivedAt: timestamp,
				updatedAt: new Date(),
			})
			.where(eq(schema.agentGraphs.id, parsed.data.workflowId))
			.returning({
				id: schema.agentGraphs.id,
				name: schema.agentGraphs.name,
				archivedAt: schema.agentGraphs.archivedAt,
			});
		if (!updatedWorkflow) {
			return c.json(
				{ message: "Failed to update workflow archive state." },
				500,
			);
		}

		return c.json({
			id: updatedWorkflow.id,
			name: updatedWorkflow.name,
			archivedAt: updatedWorkflow.archivedAt?.toISOString() ?? null,
		});
	},
);

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
	const workflow = await createWorkflow(
		c.get("dbClient"),
		{
			userId: access.context.session.userId,
			organizationId: access.context.organizationId,
		},
		parsed.data,
	);
	return c.json(workflow);
});

dashboardWorkflowRecordsRouter.post(
	"/dashboard/workflows/update",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, updateWorkflowInputSchema);
		if (!parsed.ok) return parsed.response;
		const workflow = await updateWorkflow(
			c.get("dbClient"),
			{
				userId: access.context.session.userId,
				organizationId: access.context.organizationId,
			},
			parsed.data,
		);
		return c.json(workflow);
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
						isNull(row.archivedAt),
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
