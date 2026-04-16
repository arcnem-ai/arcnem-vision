import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";
import {
	type APIKeyPermissionDomain,
	apiKeyHasPermission,
	findAPIKeyForDebugMode,
	verifyAPIKey,
} from "@/lib/api-keys";
import type { HonoServerContext } from "@/types/serverContext";

const isDebugMode = isAPIDebugModeEnabled();

export const requireAPIKey = createMiddleware<HonoServerContext>(
	async (c, next) => {
		const apiKey = c.req.header("x-api-key")?.trim();
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);

		if (isDebugMode) {
			const dbClient = c.get("dbClient");
			const debugApiKey = await findAPIKeyForDebugMode(dbClient, apiKey);

			if (!debugApiKey) {
				return c.json({ message: "Unauthorized" }, 401);
			}

			c.set("apiKey", debugApiKey);
			await next();
			return;
		}

		const verifiedKey = await verifyAPIKey(c.get("dbClient"), apiKey);
		if (!verifiedKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}
		c.set("apiKey", verifiedKey);

		await next();
	},
);

export function requireAPIKeyPermission(
	domain: APIKeyPermissionDomain,
	action: string,
): MiddlewareHandler<HonoServerContext> {
	return createMiddleware<HonoServerContext>(async (c, next) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		if (!apiKeyHasPermission(apiKey, domain, action)) {
			return c.json({ message: "Forbidden" }, 403);
		}

		await next();
	});
}

export const requireServiceAPIKey = createMiddleware<HonoServerContext>(
	async (c, next) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		if (apiKey.kind !== "service") {
			return c.json({ message: "Service API key required" }, 403);
		}

		await next();
	},
);

export const requireWorkflowAPIKey = createMiddleware<HonoServerContext>(
	async (c, next) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		if (apiKey.kind !== "workflow") {
			return c.json({ message: "Workflow API key required" }, 403);
		}

		await next();
	},
);
