import { getDB } from "@arcnem-vision/db/server";
import { inArray } from "drizzle-orm";
import {
	getBetterAuthSession,
	getDashboardSessionCookieHeader,
	listBetterAuthOrganizations,
} from "./better-auth-api";

export { getDashboardSessionCookieHeader };

export type SessionOrganizationMembership = {
	organizationId: string;
	name: string;
	slug: string;
	role: string;
};

export type SessionContext = {
	source: "cookie" | "fallback" | "none";
	sessionPreview: string | null;
	session: {
		id: string;
		userId: string;
		activeOrganizationId: string | null;
	} | null;
	user: {
		name: string | null;
		email: string;
	} | null;
	organizationId: string | null;
	organizations: SessionOrganizationMembership[];
};

export type AuthenticatedSessionContext = SessionContext & {
	session: NonNullable<SessionContext["session"]>;
};

export type AuthenticatedOrganizationContext = AuthenticatedSessionContext & {
	organizationId: string;
};

export async function getSessionContext(): Promise<SessionContext> {
	const db = getDB();
	const authSession = await getBetterAuthSession();
	const session = authSession.payload?.session ?? null;
	const user = authSession.payload?.user ?? null;
	const sessionPreview = session?.token?.slice(0, 10) ?? null;
	const source: SessionContext["source"] =
		session?.userAgent === "seed-dashboard-session"
			? "fallback"
			: authSession.source;

	if (!session || !user) {
		return {
			source,
			sessionPreview: sessionPreview ? `${sessionPreview}...` : null,
			session: null,
			user: null,
			organizationId: null,
			organizations: [],
		};
	}

	const betterAuthOrganizations = await listBetterAuthOrganizations();
	const organizationIds = betterAuthOrganizations.map(
		(organization) => organization.id,
	);
	const membershipRows =
		organizationIds.length > 0
			? await db.query.members.findMany({
					where: (row, { and, eq }) =>
						and(
							eq(row.userId, user.id),
							inArray(row.organizationId, organizationIds),
						),
					columns: {
						organizationId: true,
						role: true,
					},
				})
			: [];
	const roleByOrganizationId = new Map(
		membershipRows.map(
			(membership) => [membership.organizationId, membership.role] as const,
		),
	);

	const organizations = betterAuthOrganizations.map((organization) => ({
		organizationId: organization.id,
		name: organization.name,
		slug: organization.slug,
		role: roleByOrganizationId.get(organization.id) ?? "member",
	}));

	const resolvedOrganizationId =
		organizations.find(
			(organization) =>
				organization.organizationId === session.activeOrganizationId,
		)?.organizationId ??
		organizations[0]?.organizationId ??
		null;

	return {
		source,
		sessionPreview: sessionPreview ? `${sessionPreview}...` : null,
		session: {
			id: session.id,
			userId: session.userId,
			activeOrganizationId: session.activeOrganizationId,
		},
		user: {
			name: user.name ?? null,
			email: user.email,
		},
		organizationId: resolvedOrganizationId,
		organizations,
	};
}

export async function requireDashboardSessionContext(): Promise<AuthenticatedSessionContext> {
	const context = await getSessionContext();
	if (!context.session) {
		throw new Error("No active session for dashboard mutation.");
	}

	return {
		...context,
		session: context.session,
	};
}

export async function requireOrganizationContext() {
	const context = await requireDashboardSessionContext();
	if (!context.organizationId) {
		throw new Error("No organization context for this session.");
	}
	return context.organizationId;
}

export async function requireDashboardOrganizationContext(): Promise<AuthenticatedOrganizationContext> {
	const context = await requireDashboardSessionContext();
	if (!context.organizationId) {
		throw new Error("No organization context for this session.");
	}

	return {
		...context,
		organizationId: context.organizationId,
	};
}

export async function requireDashboardActorContext() {
	const context = await requireDashboardOrganizationContext();

	return {
		organizationId: context.organizationId,
		userId: context.session.userId,
	};
}
