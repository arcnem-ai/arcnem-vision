import { schema } from "@arcnem-vision/db";
import {
	createProjectInputSchema,
	setProjectArchivedInputSchema,
} from "@arcnem-vision/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { createUniqueSlug, requireDisplayName } from "@/lib/management-utils";
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
