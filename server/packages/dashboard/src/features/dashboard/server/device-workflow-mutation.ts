import {
	assignWorkflowInputSchema,
	deviceWorkflowAssignmentResponseSchema,
} from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { fetchDashboardAPI } from "@/lib/api-server";

export const assignWorkflowToDevice = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => assignWorkflowInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/devices/assign-workflow",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update device workflow.",
			},
			deviceWorkflowAssignmentResponseSchema,
		),
	);
