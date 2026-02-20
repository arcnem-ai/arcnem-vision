import { Hono } from "hono";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";
import { auth } from "@/lib/auth";
import type { HonoServerContext } from "@/types/serverContext";

export const authRouter = new Hono<HonoServerContext>({
	strict: false,
});
const isDebugMode = isAPIDebugModeEnabled();

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

	const verifiedKey = await auth.api.verifyApiKey({
		body: { key },
		headers: c.req.raw.headers,
	});

	if (!verifiedKey.valid) {
		return c.json(verifiedKey, 401);
	}

	return c.json(verifiedKey);
});

authRouter.on(["POST", "GET"], "/auth/*", (c) => {
	return auth.handler(c.req.raw);
});
