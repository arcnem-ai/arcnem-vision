import { getDB } from "@arcnem-vision/db/server";
import { createServerFn } from "@tanstack/react-start";
import { requireOrganizationContext } from "./session-context";

type AssignWorkflowInput = {
	deviceId: string;
	agentGraphId: string;
};

export const assignWorkflowToDevice = createServerFn({ method: "POST" })
	.inputValidator((input: AssignWorkflowInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const organizationId = await requireOrganizationContext();

		const targetDevice = await db.query.devices.findFirst({
			where: (row, { and, eq }) =>
				and(eq(row.id, data.deviceId), eq(row.organizationId, organizationId)),
			columns: { id: true },
		});
		if (!targetDevice) {
			throw new Error("Device not found in your organization.");
		}

		const targetWorkflow = await db.query.agentGraphs.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, data.agentGraphId),
					eq(row.organizationId, organizationId),
				),
			columns: { id: true },
		});
		if (!targetWorkflow) {
			throw new Error("Workflow not found in your organization.");
		}

		const updated = await db.$client.query<{
			id: string;
			agent_graph_id: string;
		}>(
			`UPDATE devices
			SET agent_graph_id = $1, updated_at = NOW()
			WHERE id = $2
			RETURNING id, agent_graph_id`,
			[data.agentGraphId, data.deviceId],
		);

		const firstRow = updated.rows[0];
		if (!firstRow) {
			throw new Error("Failed to update device workflow.");
		}

		return {
			id: firstRow.id,
			agentGraphId: firstRow.agent_graph_id,
		};
	});
