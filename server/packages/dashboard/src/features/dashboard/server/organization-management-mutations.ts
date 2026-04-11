import {
	createOrganizationInputSchema,
	organizationSummarySchema,
	switchOrganizationInputSchema,
} from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { fetchDashboardAPI } from "@/lib/api-server";

export const createOrganization = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		createOrganizationInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/organizations",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to create organization.",
			},
			organizationSummarySchema,
		),
	);

export const switchActiveOrganization = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		switchOrganizationInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/organizations/switch",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to switch organization.",
			},
			organizationSummarySchema,
		),
	);
