import {
	dashboardWebhookDeliveriesInputSchema,
	dashboardWebhookDeliveryResendInputSchema,
	dashboardWebhookEndpointCreateInputSchema,
	dashboardWebhookEndpointRevokeInputSchema,
	dashboardWebhookKeyInputSchema,
	webhookDeliveriesResponseSchema,
	webhookDeliverySchema,
	webhookEndpointCreatedSchema,
	webhookEndpointSchema,
	webhookEndpointsResponseSchema,
} from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { fetchDashboardAPI } from "@/lib/api-server";

export const listWebhookEndpoints = createServerFn({ method: "POST" })
	.validator((input: unknown) => dashboardWebhookKeyInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/webhook-endpoints/list",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to load webhook endpoints.",
			},
			webhookEndpointsResponseSchema,
		),
	);

export const createWebhookEndpoint = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		dashboardWebhookEndpointCreateInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/webhook-endpoints",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to add webhook endpoint.",
			},
			webhookEndpointCreatedSchema,
		),
	);

export const revokeWebhookEndpoint = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		dashboardWebhookEndpointRevokeInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/webhook-endpoints/revoke",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to revoke webhook endpoint.",
			},
			webhookEndpointSchema,
		),
	);

export const listWebhookDeliveries = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		dashboardWebhookDeliveriesInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/webhook-deliveries/list",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to load webhook deliveries.",
			},
			webhookDeliveriesResponseSchema,
		),
	);

export const resendWebhookDelivery = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		dashboardWebhookDeliveryResendInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/webhook-deliveries/resend",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to resend webhook delivery.",
			},
			webhookDeliverySchema,
		),
	);
