import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";
import {
	type APIKeyPermissionDomain,
	apiKeyHasPermission,
	verifyAndConsumeAPIKey,
	verifyAndConsumeAPIKeyForDebugMode,
} from "@/lib/api-keys";
import { publishAPIKeyUsedRealtimeEvent } from "@/lib/dashboard-realtime";
import type { HonoServerContext } from "@/types/serverContext";

const isDebugMode = isAPIDebugModeEnabled();

export const requireAPIKey = createMiddleware<HonoServerContext>(
	async (c, next) => {
		const apiKey = c.req.header("x-api-key")?.trim();
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);

		if (isDebugMode) {
			const dbClient = c.get("dbClient");
			const debugApiKey = await verifyAndConsumeAPIKeyForDebugMode(
				dbClient,
				apiKey,
			);

			if (!debugApiKey) {
				return c.json({ message: "Unauthorized" }, 401);
			}

			c.set("apiKey", debugApiKey);
			publishAPIKeyUsedRealtimeEvent({
				apiKeyId: debugApiKey.id,
				organizationId: debugApiKey.organizationId,
			});
			await next();
			return;
		}

		const verifiedKey = await verifyAndConsumeAPIKey(c.get("dbClient"), apiKey);
		if (!verifiedKey.ok) {
			if (verifiedKey.retryAfterSeconds) {
				c.header("Retry-After", String(verifiedKey.retryAfterSeconds));
			}

			return c.json(
				verifiedKey.retryAfterSeconds
					? {
							message: verifiedKey.message,
							retryAfterSeconds: verifiedKey.retryAfterSeconds,
						}
					: { message: verifiedKey.message },
				verifiedKey.status,
			);
		}
		c.set("apiKey", verifiedKey.apiKey);
		publishAPIKeyUsedRealtimeEvent({
			apiKeyId: verifiedKey.apiKey.id,
			organizationId: verifiedKey.apiKey.organizationId,
		});

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
