import type { PGDB } from "@arcnem-vision/db/server";
import { and, eq, isNull } from "drizzle-orm";
import { buildWorkflowTemplateAccessCondition } from "@/lib/workflow-template-access";

export async function loadDashboardOrganization(
	db: PGDB,
	organizationId: string,
) {
	return db.query.organizations.findFirst({
		where: (row, { eq }) => eq(row.id, organizationId),
		columns: {
			id: true,
			name: true,
			slug: true,
		},
	});
}

export async function loadDashboardProjects(
	db: PGDB,
	organizationId: string,
	includeArchived: boolean,
) {
	return db.query.projects.findMany({
		where: (row) =>
			includeArchived
				? eq(row.organizationId, organizationId)
				: and(eq(row.organizationId, organizationId), isNull(row.archivedAt)),
		columns: {
			id: true,
			name: true,
			slug: true,
			archivedAt: true,
		},
		orderBy: (row, { asc }) => [asc(row.name)],
	});
}

export async function loadDashboardWorkflowAPIKeys(
	db: PGDB,
	organizationId: string,
	includeArchived: boolean,
) {
	return db.query.apikeys
		.findMany({
			where: (row, { and, eq }) =>
				and(eq(row.organizationId, organizationId), eq(row.kind, "workflow")),
			columns: {
				id: true,
				projectId: true,
				agentGraphId: true,
				name: true,
				start: true,
				prefix: true,
				enabled: true,
				createdAt: true,
				updatedAt: true,
				lastRequest: true,
				expiresAt: true,
				requestCount: true,
				rateLimitEnabled: true,
				rateLimitMax: true,
				rateLimitTimeWindow: true,
			},
			with: {
				agentGraphs: {
					columns: {
						name: true,
					},
				},
				projects: {
					columns: {
						archivedAt: true,
					},
				},
			},
			orderBy: (row, { desc, asc }) => [desc(row.createdAt), asc(row.id)],
		})
		.then((rows) =>
			rows.filter((row) => includeArchived || row.projects?.archivedAt == null),
		);
}

export async function loadDashboardServiceAPIKeys(
	db: PGDB,
	organizationId: string,
	includeArchived: boolean,
) {
	return db.query.apikeys
		.findMany({
			where: (row, { and, eq }) =>
				and(eq(row.organizationId, organizationId), eq(row.kind, "service")),
			columns: {
				id: true,
				projectId: true,
				name: true,
				start: true,
				prefix: true,
				enabled: true,
				createdAt: true,
				updatedAt: true,
				lastRequest: true,
				expiresAt: true,
				requestCount: true,
				rateLimitEnabled: true,
				rateLimitMax: true,
				rateLimitTimeWindow: true,
			},
			with: {
				projects: {
					columns: {
						archivedAt: true,
					},
				},
			},
			orderBy: (row, { desc, asc }) => [desc(row.createdAt), asc(row.id)],
		})
		.then((rows) =>
			rows.filter((row) => includeArchived || row.projects?.archivedAt == null),
		);
}

export async function loadDashboardWorkflows(db: PGDB, organizationId: string) {
	return db.query.agentGraphs.findMany({
		where: (row, { eq }) => eq(row.organizationId, organizationId),
		columns: {
			id: true,
			name: true,
			description: true,
			entryNode: true,
			agentGraphTemplateId: true,
			agentGraphTemplateVersionId: true,
		},
		with: {
			agentGraphTemplateVersions: {
				columns: {
					id: true,
					version: true,
					snapshot: true,
				},
			},
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
				with: {
					models: {
						columns: {
							provider: true,
							name: true,
						},
					},
					agentGraphNodeTools: {
						with: {
							tools: {
								columns: {
									id: true,
									name: true,
									description: true,
									inputSchema: true,
									outputSchema: true,
								},
							},
						},
					},
				},
			},
			agentGraphEdges: {
				columns: {
					id: true,
					fromNode: true,
					toNode: true,
				},
			},
		},
		orderBy: (row, { asc }) => [asc(row.name)],
	});
}

export async function loadDashboardWorkflowTemplates(
	db: PGDB,
	organizationId: string,
) {
	return db.query.agentGraphTemplates.findMany({
		where: (row) => buildWorkflowTemplateAccessCondition(row, organizationId),
		columns: {
			id: true,
			visibility: true,
			organizationId: true,
		},
		with: {
			currentVersion: {
				columns: {
					id: true,
					version: true,
					snapshot: true,
				},
			},
			agentGraphTemplateVersions: {
				columns: {
					id: true,
				},
			},
		},
		orderBy: (row, { asc }) => [asc(row.createdAt)],
	});
}
