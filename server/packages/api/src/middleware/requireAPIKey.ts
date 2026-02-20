import { schema } from "@arcnem-vision/db";
import type { ApiKey } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";
import { auth } from "@/lib/auth";
import type { HonoServerContext } from "@/types/serverContext";

const { apikeys } = schema;
const isDebugMode = isAPIDebugModeEnabled();

const hashAPIKey = async (key: string): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(key),
	);

	return Buffer.from(digest).toString("base64url");
};

export const requireAPIKey = createMiddleware<HonoServerContext>(
	async (c, next) => {
		const apiKey = c.req.header("x-api-key")?.trim();
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);

		if (isDebugMode) {
			const dbClient = c.get("dbClient");
			const hashedKey = await hashAPIKey(apiKey);
			const [debugApiKey] = await dbClient
				.select({ id: apikeys.id })
				.from(apikeys)
				.where(eq(apikeys.key, hashedKey))
				.limit(1);

			if (!debugApiKey) {
				return c.json({ message: "Unauthorized" }, 401);
			}

			c.set("apiKey", { id: debugApiKey.id } as Omit<ApiKey, "key">);
			await next();
			return;
		}

		const verifiedKey = await auth.api.verifyApiKey({
			body: { key: apiKey },
			headers: c.req.raw.headers,
		});

		if (!verifiedKey.valid || !verifiedKey.key) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		c.set("apiKey", verifiedKey.key);

		await next();
	},
);
