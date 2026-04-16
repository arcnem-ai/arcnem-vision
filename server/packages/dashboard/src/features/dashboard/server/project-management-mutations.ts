import {
	apiKeyUpdateResponseSchema,
	archiveStateResponseSchema,
	createProjectInputSchema,
	createServiceApiKeyInputSchema,
	createWorkflowApiKeyInputSchema,
	type GeneratedAPIKey,
	generatedApiKeyResponseSchema,
	projectSummarySchema,
	setProjectArchivedInputSchema,
	updateServiceApiKeyInputSchema,
	updateWorkflowApiKeyInputSchema,
} from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { fetchDashboardAPI } from "@/lib/api-server";

export const createProject = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => createProjectInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/projects",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to create project.",
			},
			projectSummarySchema,
		),
	);

export const createWorkflowAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		createWorkflowApiKeyInputSchema.parse(input),
	)
	.handler(
		async ({ data }): Promise<GeneratedAPIKey> =>
			fetchDashboardAPI(
				"/dashboard/workflow-api-keys",
				{
					method: "POST",
					body: data,
					fallbackErrorMessage: "Failed to create workflow API key.",
				},
				generatedApiKeyResponseSchema,
			),
	);

export const updateWorkflowAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		updateWorkflowApiKeyInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/workflow-api-keys/update",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update workflow API key.",
			},
			apiKeyUpdateResponseSchema,
		),
	);

export const createServiceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		createServiceApiKeyInputSchema.parse(input),
	)
	.handler(
		async ({ data }): Promise<GeneratedAPIKey> =>
			fetchDashboardAPI(
				"/dashboard/service-api-keys",
				{
					method: "POST",
					body: data,
					fallbackErrorMessage: "Failed to create service API key.",
				},
				generatedApiKeyResponseSchema,
			),
	);

export const updateServiceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		updateServiceApiKeyInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/service-api-keys/update",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update service API key.",
			},
			apiKeyUpdateResponseSchema,
		),
	);

export const setProjectArchived = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		setProjectArchivedInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/projects/archive",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update project archive state.",
			},
			archiveStateResponseSchema,
		),
	);
