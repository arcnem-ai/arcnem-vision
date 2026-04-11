import {
	runItemSchema,
	runStepsResponseSchema,
	runsResponseSchema,
} from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { fetchDashboardAPI } from "@/lib/api-server";

export const getAgentGraphRuns = createServerFn({ method: "GET" })
	.inputValidator(
		(input: { organizationId: string; cursor?: string; limit?: number }) =>
			input,
	)
	.handler(async ({ data }) => {
		const params = new URLSearchParams();
		if (data.cursor) params.set("cursor", data.cursor);
		if (typeof data.limit === "number") params.set("limit", String(data.limit));

		return fetchDashboardAPI(
			`/dashboard/runs${params.size > 0 ? `?${params.toString()}` : ""}`,
			{
				method: "GET",
				fallbackErrorMessage: "Failed to load workflow runs.",
			},
			runsResponseSchema,
		);
	});

export const getAgentGraphRun = createServerFn({ method: "GET" })
	.inputValidator((input: { runId: string }) => input)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			`/dashboard/runs/${encodeURIComponent(data.runId)}`,
			{
				method: "GET",
				fallbackErrorMessage: "Failed to load workflow run.",
			},
			runItemSchema.nullable(),
		),
	);

export const getAgentGraphRunSteps = createServerFn({ method: "GET" })
	.inputValidator((input: { runId: string }) => input)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			`/dashboard/runs/${encodeURIComponent(data.runId)}/steps`,
			{
				method: "GET",
				fallbackErrorMessage: "Failed to load workflow run steps.",
			},
			runStepsResponseSchema,
		),
	);
