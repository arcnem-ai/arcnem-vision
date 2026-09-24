import {
	dashboardWebhookDeliveriesInputSchema,
	dashboardWebhookDeliveryResendInputSchema,
	dashboardWebhookEndpointCreateInputSchema,
	dashboardWebhookEndpointRevokeInputSchema,
	dashboardWebhookKeyInputSchema,
} from "@arcnem-vision/shared";
import { type Context, Hono } from "hono";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { readValidatedBody } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";
import {
	createWebhookEndpoint,
	listWebhookDeliveries,
	listWebhookEndpoints,
	requireServiceKeyOwner,
	resendWebhookDelivery,
	revokeWebhookEndpoint,
	type WebhookOwner,
} from "@/lib/webhooks/operations";
import type { HonoServerContext } from "@/types/serverContext";

const destinationPolicy = { allowPrivateHttp: isAPIDebugModeEnabled() };

export const dashboardWebhooksRouter = new Hono<HonoServerContext>({
	strict: false,
});

type Schema<T extends { apiKeyId: string }> = Parameters<
	typeof readValidatedBody<T>
>[1];

// Every dashboard webhook action names a service key in the member's organization.
function webhookAction<T extends { apiKeyId: string }>(
	schema: Schema<T>,
	run: (
		c: Context<HonoServerContext>,
		owner: WebhookOwner,
		input: T,
	) => Promise<object>,
	options: { forChange: boolean } = { forChange: false },
) {
	return async (c: Context<HonoServerContext>) => {
		const access = await requireDashboardOrganizationContext(c);
		if (!access.ok) return access.response;
		const parsed = await readValidatedBody(c, schema);
		if (!parsed.ok) return parsed.response;
		try {
			const owner = await requireServiceKeyOwner(c.get("dbClient"), {
				organizationId: access.context.organizationId,
				apiKeyId: parsed.data.apiKeyId,
				forChange: options.forChange,
			});
			return c.json(await run(c, owner, parsed.data));
		} catch (error) {
			if (error instanceof ServiceError)
				return c.json({ message: error.message }, error.status);
			throw error;
		}
	};
}

dashboardWebhooksRouter.post(
	"/dashboard/webhook-endpoints/list",
	webhookAction(dashboardWebhookKeyInputSchema, async (c, owner) => ({
		endpoints: await listWebhookEndpoints(c.get("dbClient"), owner),
	})),
);

dashboardWebhooksRouter.post(
	"/dashboard/webhook-endpoints",
	webhookAction(
		dashboardWebhookEndpointCreateInputSchema,
		(c, owner, input) =>
			createWebhookEndpoint(
				c.get("dbClient"),
				owner,
				{ url: input.url },
				destinationPolicy,
			),
		{ forChange: true },
	),
);

dashboardWebhooksRouter.post(
	"/dashboard/webhook-endpoints/revoke",
	webhookAction(
		dashboardWebhookEndpointRevokeInputSchema,
		(c, owner, input) =>
			revokeWebhookEndpoint(c.get("dbClient"), owner, input.endpointId),
		{ forChange: true },
	),
);

dashboardWebhooksRouter.post(
	"/dashboard/webhook-deliveries/list",
	webhookAction(dashboardWebhookDeliveriesInputSchema, (c, owner, input) =>
		listWebhookDeliveries(c.get("dbClient"), owner, input),
	),
);

dashboardWebhooksRouter.post(
	"/dashboard/webhook-deliveries/resend",
	webhookAction(
		dashboardWebhookDeliveryResendInputSchema,
		(c, owner, input) =>
			resendWebhookDelivery(
				c.get("dbClient"),
				c.get("inngestClient"),
				owner,
				input.deliveryId,
			),
		{ forChange: true },
	),
);
