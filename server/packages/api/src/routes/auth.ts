import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { setSignedCookie } from "hono/cookie";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";
import { verifyAPIKey } from "@/lib/api-keys";
import { auth } from "@/lib/auth";
import type { HonoServerContext } from "@/types/serverContext";

export const authRouter = new Hono<HonoServerContext>({
	strict: false,
});
const isDebugMode = isAPIDebugModeEnabled();
const DEBUG_SESSION_TOKEN =
	"seed_dashboard_session_s4M8xR2vJ7nK1qP5wL9cD3fH6tY0uB4";

function getSessionCookieName() {
	return getAPIEnvVar("BETTER_AUTH_BASE_URL").startsWith("https://")
		? "__Secure-better-auth.session_token"
		: "better-auth.session_token";
}

authRouter.get("/auth/debug/session", async (c) => {
	if (!isDebugMode) {
		return c.json({ message: "Debug auth is disabled." }, 404);
	}

	const dbClient = c.get("dbClient");
	const session = await dbClient.query.sessions.findFirst({
		where: (row) =>
			and(eq(row.token, DEBUG_SESSION_TOKEN), gt(row.expiresAt, new Date())),
		columns: {
			token: true,
			expiresAt: true,
		},
	});

	if (!session) {
		return c.json({ message: "Seed debug session was not found." }, 404);
	}

	const maxAge = Math.max(
		1,
		Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
	);

	await setSignedCookie(
		c,
		getSessionCookieName(),
		session.token,
		getAPIEnvVar("BETTER_AUTH_SECRET"),
		{
			httpOnly: true,
			maxAge,
			path: "/",
			sameSite: "lax",
			secure: getAPIEnvVar("BETTER_AUTH_BASE_URL").startsWith("https://"),
		},
	);

	return c.json({ success: true });
});

authRouter.post("/auth/api-key/verify", async (c) => {
	const payload: { key?: string } = await c.req
		.json<{ key?: string }>()
		.catch(() => ({}));
	const key = payload.key?.trim() || c.req.header("x-api-key")?.trim() || "";

	if (!key) {
		return c.json(
			{
				valid: false,
				error: { message: "API key is required", code: "INVALID_API_KEY" },
				key: null,
			},
			400,
		);
	}

	if (isDebugMode) {
		return c.json({
			valid: true,
			key: {
				id: "local-dev-api-key",
			},
		});
	}

	const verifiedKey = await verifyAPIKey(c.get("dbClient"), key);
	if (!verifiedKey) {
		return c.json(
			{
				valid: false,
				error: { message: "Unauthorized", code: "INVALID_API_KEY" },
				key: null,
			},
			401,
		);
	}

	return c.json({
		valid: true,
		key: verifiedKey,
	});
});

authRouter.on(["POST", "GET"], "/auth/*", (c) => {
	return auth.handler(c.req.raw);
});
