import { schema } from "@arcnem-vision/db";
import { getDB } from "@arcnem-vision/db/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import type { GeneratedDeviceAPIKey } from "@/features/dashboard/types";
import {
	createUniqueSlug,
	generatePlainAPIKey,
	getAPIKeyPrefix,
	getAPIKeyStart,
	hashAPIKey,
	requireDisplayName,
} from "./management-utils";
import { requireDashboardActorContext } from "./session-context";

type CreateProjectInput = {
	name: string;
};

type CreateDeviceInput = {
	projectId: string;
	name: string;
	agentGraphId: string;
};

type UpdateDeviceInput = {
	deviceId: string;
	name: string;
	agentGraphId: string;
};

type CreateDeviceAPIKeyInput = {
	deviceId: string;
	name: string;
};

type UpdateDeviceAPIKeyInput = {
	apiKeyId: string;
	name: string;
	enabled: boolean;
};

type DeleteDeviceAPIKeyInput = {
	apiKeyId: string;
};

type SetProjectArchivedInput = {
	projectId: string;
	archived: boolean;
};

type SetDeviceArchivedInput = {
	deviceId: string;
	archived: boolean;
};

async function assertWorkflowInOrganization(
	organizationId: string,
	agentGraphId: string,
) {
	const db = getDB();
	const workflow = await db.query.agentGraphs.findFirst({
		where: (row, { and, eq }) =>
			and(eq(row.id, agentGraphId), eq(row.organizationId, organizationId)),
		columns: { id: true },
	});

	if (!workflow) {
		throw new Error("Workflow not found in your organization.");
	}
}

export const createProject = createServerFn({ method: "POST" })
	.inputValidator((input: CreateProjectInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const { organizationId } = await requireDashboardActorContext();
		const name = requireDisplayName(data.name, "Project name");
		const existingProjects = await db.query.projects.findMany({
			where: (row, { eq }) => eq(row.organizationId, organizationId),
			columns: {
				slug: true,
			},
		});
		const slug = createUniqueSlug(
			name,
			existingProjects.map((project) => project.slug),
		);

		const [project] = await db
			.insert(schema.projects)
			.values({
				name,
				slug,
				organizationId,
			})
			.returning({
				id: schema.projects.id,
				name: schema.projects.name,
				slug: schema.projects.slug,
			});

		if (!project) {
			throw new Error("Failed to create project.");
		}

		return project;
	});

export const createDevice = createServerFn({ method: "POST" })
	.inputValidator((input: CreateDeviceInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const { organizationId } = await requireDashboardActorContext();
		const name = requireDisplayName(data.name, "Device name");
		const project = await db.query.projects.findFirst({
			where: (row) =>
				and(
					eq(row.id, data.projectId),
					eq(row.organizationId, organizationId),
					isNull(row.archivedAt),
				),
			columns: {
				id: true,
			},
		});

		if (!project) {
			throw new Error("Active project not found in your organization.");
		}

		await assertWorkflowInOrganization(organizationId, data.agentGraphId);

		const existingDevices = await db.query.devices.findMany({
			where: (row, { eq }) => eq(row.projectId, project.id),
			columns: {
				slug: true,
			},
		});
		const slug = createUniqueSlug(
			name,
			existingDevices.map((device) => device.slug),
		);

		const [device] = await db
			.insert(schema.devices)
			.values({
				name,
				slug,
				projectId: project.id,
				organizationId,
				agentGraphId: data.agentGraphId,
			})
			.returning({
				id: schema.devices.id,
				name: schema.devices.name,
				slug: schema.devices.slug,
				agentGraphId: schema.devices.agentGraphId,
			});

		if (!device) {
			throw new Error("Failed to create device.");
		}

		return device;
	});

export const updateDevice = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateDeviceInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const { organizationId } = await requireDashboardActorContext();
		const name = requireDisplayName(data.name, "Device name");

		const device = await db.query.devices.findFirst({
			where: (row) =>
				and(
					eq(row.id, data.deviceId),
					eq(row.organizationId, organizationId),
					isNull(row.archivedAt),
				),
			columns: {
				id: true,
			},
		});

		if (!device) {
			throw new Error("Active device not found in your organization.");
		}

		await assertWorkflowInOrganization(organizationId, data.agentGraphId);

		const [updatedDevice] = await db
			.update(schema.devices)
			.set({
				name,
				agentGraphId: data.agentGraphId,
				updatedAt: new Date(),
			})
			.where(eq(schema.devices.id, data.deviceId))
			.returning({
				id: schema.devices.id,
				name: schema.devices.name,
				agentGraphId: schema.devices.agentGraphId,
			});

		if (!updatedDevice) {
			throw new Error("Failed to update device.");
		}

		return updatedDevice;
	});

export const createDeviceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: CreateDeviceAPIKeyInput) => input)
	.handler(async ({ data }): Promise<GeneratedDeviceAPIKey> => {
		const db = getDB();
		const { organizationId, userId } = await requireDashboardActorContext();
		const name = requireDisplayName(data.name, "API key name");

		const device = await db.query.devices.findFirst({
			where: (row) =>
				and(
					eq(row.id, data.deviceId),
					eq(row.organizationId, organizationId),
					isNull(row.archivedAt),
				),
			columns: {
				id: true,
				projectId: true,
			},
		});

		if (!device) {
			throw new Error("Active device not found in your organization.");
		}

		const rawKey = generatePlainAPIKey();
		const hashedKey = await hashAPIKey(rawKey);
		const prefix = getAPIKeyPrefix(rawKey);
		const start = getAPIKeyStart(rawKey);

		const [apiKey] = await db
			.insert(schema.apikeys)
			.values({
				name,
				start,
				prefix,
				key: hashedKey,
				userId,
				organizationId,
				projectId: device.projectId,
				deviceId: device.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10_000,
				requestCount: 0,
				permissions: JSON.stringify({ uploads: ["presign", "ack"] }),
				metadata: JSON.stringify({
					source: "dashboard",
				}),
			})
			.returning({
				id: schema.apikeys.id,
				name: schema.apikeys.name,
				start: schema.apikeys.start,
				prefix: schema.apikeys.prefix,
			});

		if (!apiKey) {
			throw new Error("Failed to create API key.");
		}

		return {
			id: apiKey.id,
			name: apiKey.name,
			value: rawKey,
			start: apiKey.start,
			prefix: apiKey.prefix,
		};
	});

export const updateDeviceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateDeviceAPIKeyInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const { organizationId } = await requireDashboardActorContext();
		const name = requireDisplayName(data.name, "API key name");

		const apiKey = await db.query.apikeys.findFirst({
			where: (row, { and, eq }) =>
				and(eq(row.id, data.apiKeyId), eq(row.organizationId, organizationId)),
			columns: {
				id: true,
				deviceId: true,
			},
		});

		if (!apiKey) {
			throw new Error("API key not found in your organization.");
		}

		const device = await db.query.devices.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, apiKey.deviceId),
					eq(row.organizationId, organizationId),
				),
			columns: {
				id: true,
				archivedAt: true,
			},
		});

		if (!device) {
			throw new Error("Device not found in your organization.");
		}

		if (device.archivedAt) {
			throw new Error("Restore the device before editing its API keys.");
		}

		const [updatedKey] = await db
			.update(schema.apikeys)
			.set({
				name,
				enabled: data.enabled,
				updatedAt: new Date(),
			})
			.where(eq(schema.apikeys.id, data.apiKeyId))
			.returning({
				id: schema.apikeys.id,
				enabled: schema.apikeys.enabled,
				name: schema.apikeys.name,
			});

		if (!updatedKey) {
			throw new Error("Failed to update API key.");
		}

		return updatedKey;
	});

export const deleteDeviceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: DeleteDeviceAPIKeyInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const { organizationId } = await requireDashboardActorContext();

		const apiKey = await db.query.apikeys.findFirst({
			where: (row, { and, eq }) =>
				and(eq(row.id, data.apiKeyId), eq(row.organizationId, organizationId)),
			columns: {
				id: true,
				deviceId: true,
			},
		});

		if (!apiKey) {
			throw new Error("API key not found in your organization.");
		}

		const device = await db.query.devices.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, apiKey.deviceId),
					eq(row.organizationId, organizationId),
				),
			columns: {
				id: true,
				archivedAt: true,
			},
		});

		if (!device) {
			throw new Error("Device not found in your organization.");
		}

		if (device.archivedAt) {
			throw new Error("Restore the device before deleting its API keys.");
		}

		const [deletedKey] = await db
			.delete(schema.apikeys)
			.where(eq(schema.apikeys.id, data.apiKeyId))
			.returning({
				id: schema.apikeys.id,
			});

		if (!deletedKey) {
			throw new Error("Failed to delete API key.");
		}

		return deletedKey;
	});

export const setProjectArchived = createServerFn({ method: "POST" })
	.inputValidator((input: SetProjectArchivedInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const { organizationId } = await requireDashboardActorContext();
		const project = await db.query.projects.findFirst({
			where: (row, { and, eq }) =>
				and(eq(row.id, data.projectId), eq(row.organizationId, organizationId)),
			columns: {
				id: true,
				name: true,
				archivedAt: true,
			},
		});

		if (!project) {
			throw new Error("Project not found in your organization.");
		}

		const timestamp = data.archived ? (project.archivedAt ?? new Date()) : null;

		const updatedProject = await db.transaction(async (tx) => {
			const [nextProject] = await tx
				.update(schema.projects)
				.set({
					archivedAt: timestamp,
					updatedAt: new Date(),
				})
				.where(eq(schema.projects.id, data.projectId))
				.returning({
					id: schema.projects.id,
					name: schema.projects.name,
					archivedAt: schema.projects.archivedAt,
				});

			if (!nextProject) {
				throw new Error("Failed to update project archive state.");
			}

			await tx
				.update(schema.devices)
				.set({
					archivedAt: timestamp,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(schema.devices.projectId, data.projectId),
						eq(schema.devices.organizationId, organizationId),
					),
				);

			return nextProject;
		});

		return {
			id: updatedProject.id,
			name: updatedProject.name,
			archivedAt: updatedProject.archivedAt?.toISOString() ?? null,
		};
	});

export const setDeviceArchived = createServerFn({ method: "POST" })
	.inputValidator((input: SetDeviceArchivedInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const { organizationId } = await requireDashboardActorContext();
		const device = await db.query.devices.findFirst({
			where: (row, { and, eq }) =>
				and(eq(row.id, data.deviceId), eq(row.organizationId, organizationId)),
			columns: {
				id: true,
				name: true,
				projectId: true,
				archivedAt: true,
			},
		});

		if (!device) {
			throw new Error("Device not found in your organization.");
		}

		if (!data.archived) {
			const project = await db.query.projects.findFirst({
				where: (row, { and, eq }) =>
					and(
						eq(row.id, device.projectId),
						eq(row.organizationId, organizationId),
					),
				columns: {
					id: true,
					archivedAt: true,
				},
			});

			if (!project) {
				throw new Error("Project not found in your organization.");
			}

			if (project.archivedAt) {
				throw new Error("Restore the project before restoring this device.");
			}
		}

		const timestamp = data.archived ? (device.archivedAt ?? new Date()) : null;

		const [updatedDevice] = await db
			.update(schema.devices)
			.set({
				archivedAt: timestamp,
				updatedAt: new Date(),
			})
			.where(eq(schema.devices.id, data.deviceId))
			.returning({
				id: schema.devices.id,
				name: schema.devices.name,
				archivedAt: schema.devices.archivedAt,
			});

		if (!updatedDevice) {
			throw new Error("Failed to update device archive state.");
		}

		return {
			id: updatedDevice.id,
			name: updatedDevice.name,
			archivedAt: updatedDevice.archivedAt?.toISOString() ?? null,
		};
	});
