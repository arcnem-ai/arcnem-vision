import { schema } from "@arcnem-vision/db";
import {
	createProjectInputSchema,
	createServiceApiKeyInputSchema,
	DEFAULT_SERVICE_API_KEY_PERMISSIONS,
	deleteServiceApiKeyInputSchema,
	type GeneratedServiceAPIKey,
	setProjectArchivedInputSchema,
	updateServiceApiKeyInputSchema,
} from "@arcnem-vision/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import {
	createUniqueSlug,
	generatePlainAPIKey,
	getAPIKeyPrefix,
	getAPIKeyStart,
	hashAPIKey,
	requireDisplayName,
} from "@/lib/management-utils";
import { readValidatedBody } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardProjectsRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardProjectsRouter.post("/dashboard/projects", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const parsed = await readValidatedBody(c, createProjectInputSchema);
	if (!parsed.ok) {
		return parsed.response;
	}

	const db = c.get("dbClient");
	const name = requireDisplayName(parsed.data.name, "Project name");
	const existingProjects = await db.query.projects.findMany({
		where: (row, { eq }) =>
			eq(row.organizationId, access.context.organizationId),
		columns: {
			slug: true,
		},
	});
	const slug = createUniqueSlug(
		name,
		existingProjects.map((project) => project.slug),
	);

	const [project] = await db
		.insert(schema.projects)
		.values({
			name,
			slug,
			organizationId: access.context.organizationId,
		})
		.returning({
			id: schema.projects.id,
			name: schema.projects.name,
			slug: schema.projects.slug,
		});

	if (!project) {
		return c.json({ message: "Failed to create project." }, 500);
	}

	return c.json(project);
});

dashboardProjectsRouter.post("/dashboard/projects/archive", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const parsed = await readValidatedBody(c, setProjectArchivedInputSchema);
	if (!parsed.ok) {
		return parsed.response;
	}

	const db = c.get("dbClient");
	const project = await db.query.projects.findFirst({
		where: (row, { and, eq }) =>
			and(
				eq(row.id, parsed.data.projectId),
				eq(row.organizationId, access.context.organizationId),
			),
		columns: {
			id: true,
			name: true,
			archivedAt: true,
		},
	});
	if (!project) {
		return c.json({ message: "Project not found in your organization." }, 404);
	}

	const timestamp = parsed.data.archived
		? (project.archivedAt ?? new Date())
		: null;

	const updatedProject = await db.transaction(async (tx) => {
		const [nextProject] = await tx
			.update(schema.projects)
			.set({
				archivedAt: timestamp,
				updatedAt: new Date(),
			})
			.where(eq(schema.projects.id, parsed.data.projectId))
			.returning({
				id: schema.projects.id,
				name: schema.projects.name,
				archivedAt: schema.projects.archivedAt,
			});

		if (!nextProject) {
			throw new Error("Failed to update project archive state.");
		}

		await tx
			.update(schema.devices)
			.set({
				archivedAt: timestamp,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(schema.devices.projectId, parsed.data.projectId),
					eq(schema.devices.organizationId, access.context.organizationId),
				),
			);

		return nextProject;
	});

	return c.json({
		id: updatedProject.id,
		name: updatedProject.name,
		archivedAt: updatedProject.archivedAt?.toISOString() ?? null,
	});
});

dashboardProjectsRouter.post("/dashboard/service-api-keys", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const parsed = await readValidatedBody(c, createServiceApiKeyInputSchema);
	if (!parsed.ok) {
		return parsed.response;
	}

	const db = c.get("dbClient");
	const project = await db.query.projects.findFirst({
		where: (row, { and, eq, isNull }) =>
			and(
				eq(row.id, parsed.data.projectId),
				eq(row.organizationId, access.context.organizationId),
				isNull(row.archivedAt),
			),
		columns: {
			id: true,
		},
	});
	if (!project) {
		return c.json(
			{ message: "Active project not found in your organization." },
			404,
		);
	}

	const rawKey = generatePlainAPIKey();
	const hashedKey = await hashAPIKey(rawKey);
	const prefix = getAPIKeyPrefix(rawKey);
	const start = getAPIKeyStart(rawKey);
	const [apiKey] = await db
		.insert(schema.apikeys)
		.values({
			name: requireDisplayName(parsed.data.name, "API key name"),
			start,
			prefix,
			key: hashedKey,
			userId: access.context.session.userId,
			organizationId: access.context.organizationId,
			projectId: project.id,
			kind: "service",
			deviceId: null,
			enabled: true,
			rateLimitEnabled: true,
			rateLimitTimeWindow: 86_400_000,
			rateLimitMax: 10_000,
			requestCount: 0,
			permissions: JSON.stringify(DEFAULT_SERVICE_API_KEY_PERMISSIONS),
			metadata: JSON.stringify({ source: "dashboard" }),
		})
		.returning({
			id: schema.apikeys.id,
			name: schema.apikeys.name,
			start: schema.apikeys.start,
			prefix: schema.apikeys.prefix,
		});
	if (!apiKey) {
		return c.json({ message: "Failed to create service API key." }, 500);
	}

	const response: GeneratedServiceAPIKey = {
		id: apiKey.id,
		name: apiKey.name,
		value: rawKey,
		start: apiKey.start,
		prefix: apiKey.prefix,
	};
	return c.json(response);
});

dashboardProjectsRouter.post(
	"/dashboard/service-api-keys/update",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) {
			return access.response;
		}

		const parsed = await readValidatedBody(c, updateServiceApiKeyInputSchema);
		if (!parsed.ok) {
			return parsed.response;
		}

		const db = c.get("dbClient");
		const apiKey = await db.query.apikeys.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, parsed.data.apiKeyId),
					eq(row.organizationId, access.context.organizationId),
					eq(row.kind, "service"),
				),
			columns: { id: true, projectId: true },
		});
		if (!apiKey) {
			return c.json(
				{ message: "Service API key not found in your organization." },
				404,
			);
		}

		const project = await db.query.projects.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, apiKey.projectId),
					eq(row.organizationId, access.context.organizationId),
				),
			columns: { id: true, archivedAt: true },
		});
		if (!project) {
			return c.json(
				{ message: "Project not found in your organization." },
				404,
			);
		}
		if (project.archivedAt) {
			return c.json(
				{ message: "Restore the project before editing its service API keys." },
				409,
			);
		}

		const [updatedKey] = await db
			.update(schema.apikeys)
			.set({
				name: requireDisplayName(parsed.data.name, "API key name"),
				enabled: parsed.data.enabled,
				updatedAt: new Date(),
			})
			.where(eq(schema.apikeys.id, parsed.data.apiKeyId))
			.returning({
				id: schema.apikeys.id,
				enabled: schema.apikeys.enabled,
				name: schema.apikeys.name,
			});
		if (!updatedKey) {
			return c.json({ message: "Failed to update service API key." }, 500);
		}

		return c.json(updatedKey);
	},
);

dashboardProjectsRouter.post(
	"/dashboard/service-api-keys/delete",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) {
			return access.response;
		}

		const parsed = await readValidatedBody(c, deleteServiceApiKeyInputSchema);
		if (!parsed.ok) {
			return parsed.response;
		}

		const db = c.get("dbClient");
		const apiKey = await db.query.apikeys.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, parsed.data.apiKeyId),
					eq(row.organizationId, access.context.organizationId),
					eq(row.kind, "service"),
				),
			columns: { id: true, projectId: true },
		});
		if (!apiKey) {
			return c.json(
				{ message: "Service API key not found in your organization." },
				404,
			);
		}

		const project = await db.query.projects.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, apiKey.projectId),
					eq(row.organizationId, access.context.organizationId),
				),
			columns: { id: true, archivedAt: true },
		});
		if (!project) {
			return c.json(
				{ message: "Project not found in your organization." },
				404,
			);
		}
		if (project.archivedAt) {
			return c.json(
				{
					message: "Restore the project before deleting its service API keys.",
				},
				409,
			);
		}

		const [deletedKey] = await db
			.delete(schema.apikeys)
			.where(eq(schema.apikeys.id, parsed.data.apiKeyId))
			.returning({ id: schema.apikeys.id });
		if (!deletedKey) {
			return c.json({ message: "Failed to delete service API key." }, 500);
		}

		return c.json(deletedKey);
	},
);
