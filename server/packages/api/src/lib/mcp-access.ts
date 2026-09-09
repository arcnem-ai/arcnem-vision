import { members, organizations, projects } from "@arcnem-vision/db/schema";
import type { PGDB } from "@arcnem-vision/db/server";
import { and, desc, eq, lt } from "drizzle-orm";
import type { McpPrincipal } from "./mcp-auth";
import { ServiceError } from "./service-error";

export async function requireMcpOrganization(
	db: PGDB,
	principal: McpPrincipal,
	organizationId: string,
) {
	const membership = await db.query.members.findFirst({
		where: and(
			eq(members.userId, principal.userId),
			eq(members.organizationId, organizationId),
		),
		columns: { organizationId: true },
	});
	if (!membership) throw new ServiceError(404, "Organization not found");
	return {
		userId: principal.userId,
		organizationId: membership.organizationId,
	};
}

export async function requireMcpProject(
	db: PGDB,
	principal: McpPrincipal,
	projectId: string,
) {
	const [project] = await db
		.select({ projectId: projects.id, organizationId: projects.organizationId })
		.from(projects)
		.innerJoin(
			members,
			and(
				eq(members.organizationId, projects.organizationId),
				eq(members.userId, principal.userId),
			),
		)
		.where(eq(projects.id, projectId))
		.limit(1);
	if (!project) throw new ServiceError(404, "Project not found");
	return { ...project, userId: principal.userId };
}

export async function listMcpProjects(
	db: PGDB,
	principal: McpPrincipal,
	input: { organizationId?: string; cursor?: string; limit?: number },
) {
	if (input.organizationId)
		await requireMcpOrganization(db, principal, input.organizationId);
	const limit = input.limit ?? 20;
	const rows = await db
		.select({
			id: projects.id,
			name: projects.name,
			slug: projects.slug,
			organizationId: projects.organizationId,
			organizationName: organizations.name,
		})
		.from(projects)
		.innerJoin(organizations, eq(projects.organizationId, organizations.id))
		.innerJoin(
			members,
			and(
				eq(members.organizationId, projects.organizationId),
				eq(members.userId, principal.userId),
			),
		)
		.where(
			and(
				input.organizationId
					? eq(projects.organizationId, input.organizationId)
					: undefined,
				input.cursor ? lt(projects.id, input.cursor) : undefined,
			),
		)
		.orderBy(desc(projects.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	return {
		projects: page,
		nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
	};
}
