import { schema } from "@arcnem-vision/db";
import {
	createDeviceApiKeyInputSchema,
	DEFAULT_DEVICE_API_KEY_PERMISSIONS,
	deleteDeviceApiKeyInputSchema,
	type GeneratedDeviceAPIKey,
	updateDeviceApiKeyInputSchema,
} from "@arcnem-vision/shared";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import {
	generatePlainAPIKey,
	getAPIKeyPrefix,
	getAPIKeyStart,
	hashAPIKey,
	requireDisplayName,
} from "@/lib/management-utils";
import { readValidatedBody } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardDeviceAPIKeysRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardDeviceAPIKeysRouter.post("/dashboard/device-api-keys", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) return access.response;
	const parsed = await readValidatedBody(c, createDeviceApiKeyInputSchema);
	if (!parsed.ok) return parsed.response;

	const db = c.get("dbClient");
	const device = await db.query.devices.findFirst({
		where: (row) =>
			and(
				eq(row.id, parsed.data.deviceId),
				eq(row.organizationId, access.context.organizationId),
				isNull(row.archivedAt),
			),
		columns: {
			id: true,
			projectId: true,
		},
	});
	if (!device) {
		return c.json(
			{ message: "Active device not found in your organization." },
			404,
		);
	}

	const rawKey = generatePlainAPIKey();
	const hashedKey = await hashAPIKey(rawKey);
	const prefix = getAPIKeyPrefix(rawKey);
	const start = getAPIKeyStart(rawKey);
	const [apiKey] = await db
		.insert(schema.apikeys)
		.values({
			name: requireDisplayName(parsed.data.name, "API key name"),
			start,
			prefix,
			key: hashedKey,
			userId: access.context.session.userId,
			organizationId: access.context.organizationId,
			projectId: device.projectId,
			kind: "device",
			deviceId: device.id,
			enabled: true,
			rateLimitEnabled: true,
			rateLimitTimeWindow: 86_400_000,
			rateLimitMax: 10_000,
			requestCount: 0,
			permissions: JSON.stringify(DEFAULT_DEVICE_API_KEY_PERMISSIONS),
			metadata: JSON.stringify({ source: "dashboard" }),
		})
		.returning({
			id: schema.apikeys.id,
			name: schema.apikeys.name,
			start: schema.apikeys.start,
			prefix: schema.apikeys.prefix,
		});
	if (!apiKey) {
		return c.json({ message: "Failed to create API key." }, 500);
	}

	const response: GeneratedDeviceAPIKey = {
		id: apiKey.id,
		name: apiKey.name,
		value: rawKey,
		start: apiKey.start,
		prefix: apiKey.prefix,
	};
	return c.json(response);
});

dashboardDeviceAPIKeysRouter.post(
	"/dashboard/device-api-keys/update",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, updateDeviceApiKeyInputSchema);
		if (!parsed.ok) return parsed.response;

		const db = c.get("dbClient");
		const apiKey = await db.query.apikeys.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, parsed.data.apiKeyId),
					eq(row.organizationId, access.context.organizationId),
					eq(row.kind, "device"),
				),
			columns: { id: true, deviceId: true },
		});
		if (!apiKey) {
			return c.json(
				{ message: "API key not found in your organization." },
				404,
			);
		}
		if (!apiKey.deviceId) {
			return c.json({ message: "API key is not attached to a device." }, 409);
		}
		const deviceId = apiKey.deviceId;

		const device = await db.query.devices.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, deviceId),
					eq(row.organizationId, access.context.organizationId),
				),
			columns: { id: true, archivedAt: true },
		});
		if (!device) {
			return c.json({ message: "Device not found in your organization." }, 404);
		}
		if (device.archivedAt) {
			return c.json(
				{ message: "Restore the device before editing its API keys." },
				409,
			);
		}

		const [updatedKey] = await db
			.update(schema.apikeys)
			.set({
				name: requireDisplayName(parsed.data.name, "API key name"),
				enabled: parsed.data.enabled,
				updatedAt: new Date(),
			})
			.where(eq(schema.apikeys.id, parsed.data.apiKeyId))
			.returning({
				id: schema.apikeys.id,
				enabled: schema.apikeys.enabled,
				name: schema.apikeys.name,
			});
		if (!updatedKey) {
			return c.json({ message: "Failed to update API key." }, 500);
		}

		return c.json(updatedKey);
	},
);

dashboardDeviceAPIKeysRouter.post(
	"/dashboard/device-api-keys/delete",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, deleteDeviceApiKeyInputSchema);
		if (!parsed.ok) return parsed.response;

		const db = c.get("dbClient");
		const apiKey = await db.query.apikeys.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, parsed.data.apiKeyId),
					eq(row.organizationId, access.context.organizationId),
					eq(row.kind, "device"),
				),
			columns: { id: true, deviceId: true },
		});
		if (!apiKey) {
			return c.json(
				{ message: "API key not found in your organization." },
				404,
			);
		}
		if (!apiKey.deviceId) {
			return c.json({ message: "API key is not attached to a device." }, 409);
		}
		const deviceId = apiKey.deviceId;

		const device = await db.query.devices.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, deviceId),
					eq(row.organizationId, access.context.organizationId),
				),
			columns: { id: true, archivedAt: true },
		});
		if (!device) {
			return c.json({ message: "Device not found in your organization." }, 404);
		}
		if (device.archivedAt) {
			return c.json(
				{ message: "Restore the device before deleting its API keys." },
				409,
			);
		}

		const [deletedKey] = await db
			.delete(schema.apikeys)
			.where(eq(schema.apikeys.id, parsed.data.apiKeyId))
			.returning({ id: schema.apikeys.id });
		if (!deletedKey) {
			return c.json({ message: "Failed to delete API key." }, 500);
		}

		return c.json(deletedKey);
	},
);
