import { getDB } from "@arcnem-vision/db/server";
import { getCookie } from "@tanstack/react-start/server";

export const FALLBACK_DEV_SESSION_TOKEN =
	"seed_dashboard_session_s4M8xR2vJ7nK1qP5wL9cD3fH6tY0uB4";

export type SessionContext = {
	source: "cookie" | "fallback";
	sessionPreview: string | null;
	session: {
		userId: string;
		activeOrganizationId: string | null;
	} | null;
	user: {
		name: string | null;
		email: string;
	} | null;
	organizationId: string | null;
};

function buildSessionTokenCandidates(
	rawCookie: string | undefined,
	fallbackToken: string,
) {
	const candidateTokens = new Set<string>();
	const pushCandidate = (value: string | undefined) => {
		if (!value) return;
		try {
			const decoded = decodeURIComponent(value);
			if (decoded) candidateTokens.add(decoded);
			const splitAt = decoded.lastIndexOf(".");
			if (splitAt > 0) {
				candidateTokens.add(decoded.slice(0, splitAt));
			}
		} catch {
			candidateTokens.add(value);
		}
	};

	pushCandidate(rawCookie);
	if (!rawCookie) {
		pushCandidate(fallbackToken);
	}

	return candidateTokens;
}

export async function getSessionContext(): Promise<SessionContext> {
	const db = getDB();
	const rawCookie = getCookie("better-auth.session_token");
	const source: "cookie" | "fallback" = rawCookie ? "cookie" : "fallback";
	const fallbackToken =
		process.env.DASHBOARD_SESSION_TOKEN ?? FALLBACK_DEV_SESSION_TOKEN;
	const candidateTokens = buildSessionTokenCandidates(rawCookie, fallbackToken);

	let activeSession:
		| {
				userId: string;
				activeOrganizationId: string | null;
		  }
		| undefined;
	let sessionPreview: string | null = null;
	for (const token of candidateTokens) {
		sessionPreview = `${token.slice(0, 10)}...`;
		const session = await db.query.sessions.findFirst({
			where: (row, { and, eq, gt }) =>
				and(eq(row.token, token), gt(row.expiresAt, new Date())),
			columns: {
				userId: true,
				activeOrganizationId: true,
			},
		});
		if (session) {
			activeSession = session;
			break;
		}
	}

	if (!activeSession) {
		return {
			source,
			sessionPreview,
			session: null,
			user: null,
			organizationId: null,
		};
	}

	const user = await db.query.users.findFirst({
		where: (row, { eq }) => eq(row.id, activeSession.userId),
		columns: {
			name: true,
			email: true,
		},
	});

	const member =
		activeSession.activeOrganizationId === null
			? await db.query.members.findFirst({
					where: (row, { eq }) => eq(row.userId, activeSession.userId),
					columns: {
						organizationId: true,
					},
				})
			: undefined;

	return {
		source,
		sessionPreview,
		session: activeSession,
		user: user ?? null,
		organizationId:
			activeSession.activeOrganizationId ?? member?.organizationId ?? null,
	};
}

export async function requireOrganizationContext() {
	const context = await getSessionContext();
	if (!context.session) {
		throw new Error("No active session for dashboard mutation.");
	}
	if (!context.organizationId) {
		throw new Error("No organization context for this session.");
	}
	return context.organizationId;
}
