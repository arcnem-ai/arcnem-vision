import {
	archiveStateResponseSchema,
	createDeviceApiKeyInputSchema,
	createDeviceInputSchema,
	createProjectInputSchema,
	createServiceApiKeyInputSchema,
	deleteServiceApiKeyInputSchema,
	deviceApiKeyUpdateResponseSchema,
	deviceCreateResponseSchema,
	deviceUpdateResponseSchema,
	type GeneratedAPIKey,
	type GeneratedDeviceAPIKey,
	generatedApiKeyResponseSchema,
	idResponseSchema,
	projectSummarySchema,
	setDeviceArchivedInputSchema,
	setProjectArchivedInputSchema,
	updateDeviceApiKeyInputSchema,
	updateDeviceInputSchema,
	updateServiceApiKeyInputSchema,
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

export const createDevice = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => createDeviceInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/devices",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to create device.",
			},
			deviceCreateResponseSchema,
		),
	);

export const updateDevice = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => updateDeviceInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/devices/update",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update device.",
			},
			deviceUpdateResponseSchema,
		),
	);

export const createDeviceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		createDeviceApiKeyInputSchema.parse(input),
	)
	.handler(
		async ({ data }): Promise<GeneratedDeviceAPIKey> =>
			fetchDashboardAPI(
				"/dashboard/device-api-keys",
				{
					method: "POST",
					body: data,
					fallbackErrorMessage: "Failed to create API key.",
				},
				generatedApiKeyResponseSchema,
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

export const updateDeviceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		updateDeviceApiKeyInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/device-api-keys/update",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update API key.",
			},
			deviceApiKeyUpdateResponseSchema,
		),
	);

export const deleteDeviceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: { apiKeyId: string }) => input)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/device-api-keys/delete",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to delete API key.",
			},
			idResponseSchema,
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
			deviceApiKeyUpdateResponseSchema,
		),
	);

export const deleteServiceAPIKey = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		deleteServiceApiKeyInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/service-api-keys/delete",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to delete service API key.",
			},
			idResponseSchema,
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

export const setDeviceArchived = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => setDeviceArchivedInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/devices/archive",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update device archive state.",
			},
			archiveStateResponseSchema,
		),
	);
