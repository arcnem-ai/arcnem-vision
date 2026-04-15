import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { requireAPIKeyPermission, requireServiceAPIKey } from "./requireAPIKey";

const baseAPIKey = {
	id: "key-1",
	userId: "user-1",
	organizationId: "org-1",
	projectId: "project-1",
	deviceId: null as string | null,
	metadata: null,
};

function buildApp(input: {
	apiKey:
		| (typeof baseAPIKey & {
				kind: "device" | "service";
				permissions: Record<string, string[]>;
		  })
		| null;
	useServiceGuard?: boolean;
	usePermissionGuard?: {
		domain: "uploads" | "documents" | "workflows";
		action: string;
	};
}) {
	const app = new Hono<HonoServerContext>();

	app.use("*", async (c, next) => {
		c.set("apiKey", input.apiKey);
		await next();
	});

	if (input.useServiceGuard && input.usePermissionGuard) {
		app.get(
			"/",
			requireServiceAPIKey,
			requireAPIKeyPermission(
				input.usePermissionGuard.domain,
				input.usePermissionGuard.action,
			),
			(c) => c.json({ ok: true }),
		);
		return app;
	}

	if (input.useServiceGuard) {
		app.get("/", requireServiceAPIKey, (c) => c.json({ ok: true }));
		return app;
	}

	if (input.usePermissionGuard) {
		app.get(
			"/",
			requireAPIKeyPermission(
				input.usePermissionGuard.domain,
				input.usePermissionGuard.action,
			),
			(c) => c.json({ ok: true }),
		);
		return app;
	}

	app.get("/", (c) => c.json({ ok: true }));

	return app;
}

describe("requireAPIKeyPermission", () => {
	test("returns unauthorized when no API key is present", async () => {
		const response = await buildApp({
			apiKey: null,
			usePermissionGuard: { domain: "documents", action: "read" },
		}).request("/");

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ message: "Unauthorized" });
	});

	test("returns forbidden when the permission is missing", async () => {
		const response = await buildApp({
			apiKey: {
				...baseAPIKey,
				kind: "service",
				permissions: { documents: ["list"] },
			},
			usePermissionGuard: { domain: "documents", action: "read" },
		}).request("/");

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ message: "Forbidden" });
	});

	test("accepts explicit permissions and wildcards", async () => {
		const explicit = await buildApp({
			apiKey: {
				...baseAPIKey,
				kind: "service",
				permissions: { workflows: ["read"] },
			},
			usePermissionGuard: { domain: "workflows", action: "read" },
		}).request("/");
		expect(explicit.status).toBe(200);

		const wildcard = await buildApp({
			apiKey: {
				...baseAPIKey,
				kind: "service",
				permissions: { documents: ["*"] },
			},
			usePermissionGuard: { domain: "documents", action: "visibility" },
		}).request("/");
		expect(wildcard.status).toBe(200);
	});
});

describe("requireServiceAPIKey", () => {
	test("rejects device API keys", async () => {
		const response = await buildApp({
			apiKey: {
				...baseAPIKey,
				deviceId: "device-1",
				kind: "device",
				permissions: { uploads: ["presign"] },
			},
			useServiceGuard: true,
		}).request("/");

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			message: "Service API key required",
		});
	});

	test("allows service API keys", async () => {
		const response = await buildApp({
			apiKey: {
				...baseAPIKey,
				kind: "service",
				permissions: { uploads: ["presign"] },
			},
			useServiceGuard: true,
		}).request("/");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});
});
