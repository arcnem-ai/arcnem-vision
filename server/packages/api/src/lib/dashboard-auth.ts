import { schema } from "@arcnem-vision/db";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import type { HonoServerContext } from "@/types/serverContext";

const { members, organizations } = schema;

export type DashboardSessionOrganization = {
	organizationId: string;
	name: string;
	slug: string;
	role: string;
};

export type DashboardSessionContext = {
	source: "cookie" | "fallback" | "none";
	sessionPreview: string | null;
	session: {
		id: string;
		userId: string;
		activeOrganizationId: string | null;
	} | null;
	user: {
		id: string;
		name: string | null;
		email: string;
	} | null;
	organizationId: string | null;
	organizations: DashboardSessionOrganization[];
};

type AuthenticatedDashboardSessionContext = DashboardSessionContext & {
	session: NonNullable<DashboardSessionContext["session"]>;
};

type ScopedDashboardSessionContext = AuthenticatedDashboardSessionContext & {
	organizationId: string;
};

export async function getDashboardSessionContext(
	c: Context<HonoServerContext>,
): Promise<DashboardSessionContext> {
	const session = c.get("session");
	const user = c.get("user");

	if (!session || !user) {
		return {
			source: "none",
			sessionPreview: null,
			session: null,
			user: null,
			organizationId: null,
			organizations: [],
		};
	}

	const dbClient = c.get("dbClient");
	const memberships = await dbClient
		.select({
			organizationId: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			role: members.role,
		})
		.from(members)
		.innerJoin(organizations, eq(members.organizationId, organizations.id))
		.where(eq(members.userId, user.id));

	const activeOrganizationId =
		(session as { activeOrganizationId?: string | null })
			.activeOrganizationId ?? null;
	const resolvedOrganizationId =
		memberships.find(
			(membership) => membership.organizationId === activeOrganizationId,
		)?.organizationId ??
		memberships[0]?.organizationId ??
		null;
	const source: DashboardSessionContext["source"] =
		session.userAgent === "seed-dashboard-session" ? "fallback" : "cookie";

	return {
		source,
		sessionPreview: session.token ? `${session.token.slice(0, 10)}...` : null,
		session: {
			id: session.id,
			userId: session.userId,
			activeOrganizationId,
		},
		user: {
			id: user.id,
			name: user.name ?? null,
			email: user.email,
		},
		organizationId: resolvedOrganizationId,
		organizations: memberships,
	};
}

export async function requireDashboardOrganizationContext(
	c: Context<HonoServerContext>,
) {
	const context = await getDashboardSessionContext(c);
	if (!context.session) {
		return {
			ok: false as const,
			response: c.json({ message: "Unauthorized" }, 401),
		};
	}
	if (!context.organizationId) {
		return {
			ok: false as const,
			response: c.json({ message: "No organization context" }, 403),
		};
	}

	return {
		ok: true as const,
		context: context as ScopedDashboardSessionContext,
	};
}

export async function requireDashboardSessionContext(
	c: Context<HonoServerContext>,
) {
	const context = await getDashboardSessionContext(c);
	if (!context.session) {
		return {
			ok: false as const,
			response: c.json({ message: "Unauthorized" }, 401),
		};
	}

	return {
		ok: true as const,
		context: context as AuthenticatedDashboardSessionContext,
	};
}

export async function requireOrganizationMembership(
	c: Context<HonoServerContext>,
	organizationId: string,
) {
	const sessionContext = await getDashboardSessionContext(c);
	if (!sessionContext.session || !sessionContext.user) {
		return false;
	}

	if (
		sessionContext.organizations.some(
			(membership) => membership.organizationId === organizationId,
		)
	) {
		return true;
	}

	const userId = sessionContext.user.id;
	const dbClient = c.get("dbClient");
	const membership = await dbClient.query.members.findFirst({
		where: (row, { and, eq }) =>
			and(eq(row.userId, userId), eq(row.organizationId, organizationId)),
		columns: {
			organizationId: true,
		},
	});

	return Boolean(membership);
}
