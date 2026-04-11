import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	assignWorkflowInputSchema,
	createDeviceInputSchema,
	setDeviceArchivedInputSchema,
	updateDeviceInputSchema,
} from "@arcnem-vision/shared";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { createUniqueSlug, requireDisplayName } from "@/lib/management-utils";
import { readValidatedBody } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

async function workflowExists(
	db: PGDB,
	organizationId: string,
	agentGraphId: string,
) {
	const workflow = await db.query.agentGraphs.findFirst({
		where: (row, { and, eq }) =>
			and(eq(row.id, agentGraphId), eq(row.organizationId, organizationId)),
		columns: { id: true },
	});

	return Boolean(workflow);
}

export const dashboardDeviceRecordsRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardDeviceRecordsRouter.post("/dashboard/devices", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) return access.response;
	const parsed = await readValidatedBody(c, createDeviceInputSchema);
	if (!parsed.ok) return parsed.response;

	const db = c.get("dbClient");
	const name = requireDisplayName(parsed.data.name, "Device name");
	const project = await db.query.projects.findFirst({
		where: (row) =>
			and(
				eq(row.id, parsed.data.projectId),
				eq(row.organizationId, access.context.organizationId),
				isNull(row.archivedAt),
			),
		columns: { id: true },
	});
	if (!project) {
		return c.json(
			{ message: "Active project not found in your organization." },
			404,
		);
	}
	if (
		!(await workflowExists(
			db,
			access.context.organizationId,
			parsed.data.agentGraphId,
		))
	) {
		return c.json({ message: "Workflow not found in your organization." }, 404);
	}

	const existingDevices = await db.query.devices.findMany({
		where: (row, { eq }) => eq(row.projectId, project.id),
		columns: { slug: true },
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
			organizationId: access.context.organizationId,
			agentGraphId: parsed.data.agentGraphId,
		})
		.returning({
			id: schema.devices.id,
			name: schema.devices.name,
			slug: schema.devices.slug,
			agentGraphId: schema.devices.agentGraphId,
		});
	if (!device) {
		return c.json({ message: "Failed to create device." }, 500);
	}

	return c.json(device);
});

dashboardDeviceRecordsRouter.post("/dashboard/devices/update", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) return access.response;
	const parsed = await readValidatedBody(c, updateDeviceInputSchema);
	if (!parsed.ok) return parsed.response;

	const db = c.get("dbClient");
	const device = await db.query.devices.findFirst({
		where: (row) =>
			and(
				eq(row.id, parsed.data.deviceId),
				eq(row.organizationId, access.context.organizationId),
				isNull(row.archivedAt),
			),
		columns: { id: true },
	});
	if (!device) {
		return c.json(
			{ message: "Active device not found in your organization." },
			404,
		);
	}
	if (
		!(await workflowExists(
			db,
			access.context.organizationId,
			parsed.data.agentGraphId,
		))
	) {
		return c.json({ message: "Workflow not found in your organization." }, 404);
	}

	const [updatedDevice] = await db
		.update(schema.devices)
		.set({
			name: requireDisplayName(parsed.data.name, "Device name"),
			agentGraphId: parsed.data.agentGraphId,
			updatedAt: new Date(),
		})
		.where(eq(schema.devices.id, parsed.data.deviceId))
		.returning({
			id: schema.devices.id,
			name: schema.devices.name,
			agentGraphId: schema.devices.agentGraphId,
		});
	if (!updatedDevice) {
		return c.json({ message: "Failed to update device." }, 500);
	}

	return c.json(updatedDevice);
});

dashboardDeviceRecordsRouter.post(
	"/dashboard/devices/assign-workflow",
	async (c) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, assignWorkflowInputSchema);
		if (!parsed.ok) return parsed.response;

		const db = c.get("dbClient");
		const device = await db.query.devices.findFirst({
			where: (row) =>
				and(
					eq(row.id, parsed.data.deviceId),
					eq(row.organizationId, access.context.organizationId),
					isNull(row.archivedAt),
				),
			columns: { id: true },
		});
		if (!device) {
			return c.json(
				{ message: "Active device not found in your organization." },
				404,
			);
		}
		if (
			!(await workflowExists(
				db,
				access.context.organizationId,
				parsed.data.agentGraphId,
			))
		) {
			return c.json(
				{ message: "Workflow not found in your organization." },
				404,
			);
		}

		const [updatedDevice] = await db
			.update(schema.devices)
			.set({
				agentGraphId: parsed.data.agentGraphId,
				updatedAt: new Date(),
			})
			.where(eq(schema.devices.id, parsed.data.deviceId))
			.returning({
				id: schema.devices.id,
				agentGraphId: schema.devices.agentGraphId,
			});
		if (!updatedDevice) {
			return c.json({ message: "Failed to update device workflow." }, 500);
		}

		return c.json(updatedDevice);
	},
);

dashboardDeviceRecordsRouter.post("/dashboard/devices/archive", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) return access.response;
	const parsed = await readValidatedBody(c, setDeviceArchivedInputSchema);
	if (!parsed.ok) return parsed.response;

	const db = c.get("dbClient");
	const device = await db.query.devices.findFirst({
		where: (row, { and, eq }) =>
			and(
				eq(row.id, parsed.data.deviceId),
				eq(row.organizationId, access.context.organizationId),
			),
		columns: {
			id: true,
			name: true,
			projectId: true,
			archivedAt: true,
		},
	});
	if (!device) {
		return c.json({ message: "Device not found in your organization." }, 404);
	}

	if (!parsed.data.archived) {
		const project = await db.query.projects.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, device.projectId),
					eq(row.organizationId, access.context.organizationId),
				),
			columns: {
				id: true,
				archivedAt: true,
			},
		});
		if (!project) {
			return c.json(
				{ message: "Project not found in your organization." },
				404,
			);
		}
		if (project.archivedAt) {
			return c.json(
				{ message: "Restore the project before restoring this device." },
				409,
			);
		}
	}

	const timestamp = parsed.data.archived
		? (device.archivedAt ?? new Date())
		: null;
	const [updatedDevice] = await db
		.update(schema.devices)
		.set({
			archivedAt: timestamp,
			updatedAt: new Date(),
		})
		.where(eq(schema.devices.id, parsed.data.deviceId))
		.returning({
			id: schema.devices.id,
			name: schema.devices.name,
			archivedAt: schema.devices.archivedAt,
		});
	if (!updatedDevice) {
		return c.json({ message: "Failed to update device archive state." }, 500);
	}

	return c.json({
		id: updatedDevice.id,
		name: updatedDevice.name,
		archivedAt: updatedDevice.archivedAt?.toISOString() ?? null,
	});
});
