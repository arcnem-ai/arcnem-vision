import {
	serviceErrorResponseSchema,
	webhookDeliveriesResponseSchema,
	webhookDeliveryListQuerySchema,
	webhookDeliverySchema,
	webhookEndpointCreatedSchema,
	webhookEndpointCreateRequestSchema,
	webhookEndpointSchema,
	webhookEndpointsResponseSchema,
} from "@arcnem-vision/shared";
import { type Context, Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";
import { ServiceError } from "@/lib/service-error";
import {
	createWebhookEndpoint,
	listWebhookDeliveries,
	listWebhookEndpoints,
	resendWebhookDelivery,
	revokeWebhookEndpoint,
	type WebhookOwner,
} from "@/lib/webhooks/operations";
import {
	requireAPIKey,
	requireAPIKeyPermission,
	requireServiceAPIKey,
} from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";
import { serviceJSONBodyValidation } from "./service.helpers";

const jsonErrorSchema = resolver(serviceErrorResponseSchema);
const errorResponse = (description: string) => ({
	description,
	content: { "application/json": { schema: jsonErrorSchema } },
});
const authErrors = {
	401: errorResponse("Unauthorized"),
	403: errorResponse("Forbidden"),
};
const destinationPolicy = { allowPrivateHttp: isAPIDebugModeEnabled() };

export const serviceWebhooksRouter = new Hono<HonoServerContext>({
	strict: false,
});

function webhookOwner(c: Context<HonoServerContext>): WebhookOwner | null {
	const apiKey = c.get("apiKey");
	return apiKey ? { projectId: apiKey.projectId, apiKeyId: apiKey.id } : null;
}

function serviceErrorResponse(c: Context<HonoServerContext>, error: unknown) {
	if (error instanceof ServiceError)
		return c.json({ message: error.message }, error.status);
	throw error;
}

serviceWebhooksRouter.post(
	"/service/webhook-endpoints",
	describeRoute({
		tags: ["Service"],
		summary: "Register a webhook endpoint",
		description:
			"Registers an HTTPS endpoint for this service key's workflow.completed and workflow.failed events. The signing secret is returned once.",
		responses: {
			201: {
				description: "Endpoint registered",
				content: {
					"application/json": {
						schema: resolver(webhookEndpointCreatedSchema),
					},
				},
			},
			400: errorResponse("Invalid or non-public URL"),
			...authErrors,
			409: errorResponse("Endpoint limit reached"),
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("webhooks", "manage"),
	validator(
		"json",
		webhookEndpointCreateRequestSchema,
		serviceJSONBodyValidation,
	),
	async (c) => {
		const owner = webhookOwner(c);
		if (!owner) return c.json({ message: "Unauthorized" }, 401);
		try {
			return c.json(
				await createWebhookEndpoint(
					c.get("dbClient"),
					owner,
					c.req.valid("json"),
					destinationPolicy,
				),
				201,
			);
		} catch (error) {
			return serviceErrorResponse(c, error);
		}
	},
);

serviceWebhooksRouter.get(
	"/service/webhook-endpoints",
	describeRoute({
		tags: ["Service"],
		summary: "List webhook endpoints",
		responses: {
			200: {
				description: "Endpoints owned by this service key",
				content: {
					"application/json": {
						schema: resolver(webhookEndpointsResponseSchema),
					},
				},
			},
			...authErrors,
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("webhooks", "read"),
	async (c) => {
		const owner = webhookOwner(c);
		if (!owner) return c.json({ message: "Unauthorized" }, 401);
		return c.json({
			endpoints: await listWebhookEndpoints(c.get("dbClient"), owner),
		});
	},
);

serviceWebhooksRouter.delete(
	"/service/webhook-endpoints/:id",
	describeRoute({
		tags: ["Service"],
		summary: "Revoke a webhook endpoint",
		description:
			"Stops future deliveries to the endpoint. A request already in flight cannot be recalled.",
		parameters: [
			{ name: "id", in: "path", required: true, schema: { type: "string" } },
		],
		responses: {
			200: {
				description: "Endpoint revoked",
				content: {
					"application/json": { schema: resolver(webhookEndpointSchema) },
				},
			},
			...authErrors,
			404: errorResponse("Endpoint not found"),
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("webhooks", "manage"),
	async (c) => {
		const owner = webhookOwner(c);
		if (!owner) return c.json({ message: "Unauthorized" }, 401);
		try {
			return c.json(
				await revokeWebhookEndpoint(
					c.get("dbClient"),
					owner,
					c.req.param("id"),
				),
			);
		} catch (error) {
			return serviceErrorResponse(c, error);
		}
	},
);

serviceWebhooksRouter.get(
	"/service/webhook-deliveries",
	describeRoute({
		tags: ["Service"],
		summary: "List webhook deliveries",
		description:
			"Lists deliveries to this service key's endpoints, newest first, with each attempt.",
		parameters: [
			{
				name: "endpointId",
				in: "query",
				required: false,
				schema: { type: "string" },
			},
			{
				name: "executionId",
				in: "query",
				required: false,
				schema: { type: "string" },
			},
			{
				name: "limit",
				in: "query",
				required: false,
				schema: { type: "integer", minimum: 1, maximum: 100 },
			},
			{
				name: "cursor",
				in: "query",
				required: false,
				schema: { type: "string" },
			},
		],
		responses: {
			200: {
				description: "Delivery page",
				content: {
					"application/json": {
						schema: resolver(webhookDeliveriesResponseSchema),
					},
				},
			},
			400: errorResponse("Invalid filters"),
			...authErrors,
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("webhooks", "read"),
	async (c) => {
		const owner = webhookOwner(c);
		if (!owner) return c.json({ message: "Unauthorized" }, 401);
		const limit = c.req.query("limit");
		const query = webhookDeliveryListQuerySchema.safeParse({
			endpointId: c.req.query("endpointId"),
			executionId: c.req.query("executionId"),
			cursor: c.req.query("cursor"),
			limit: limit === undefined ? undefined : Number(limit),
		});
		if (!query.success)
			return c.json({ message: "Invalid webhook delivery filters" }, 400);
		try {
			return c.json(
				await listWebhookDeliveries(c.get("dbClient"), owner, query.data),
			);
		} catch (error) {
			return serviceErrorResponse(c, error);
		}
	},
);

serviceWebhooksRouter.post(
	"/service/webhook-deliveries/:id/resend",
	describeRoute({
		tags: ["Service"],
		summary: "Resend a webhook delivery",
		description:
			"Sends the same event ID and body to the original endpoint again. The workflow is not rerun. A resend supersedes any earlier attempt still in flight, and repeating it is safe.",
		parameters: [
			{ name: "id", in: "path", required: true, schema: { type: "string" } },
		],
		responses: {
			202: {
				description: "Delivery queued",
				content: {
					"application/json": { schema: resolver(webhookDeliverySchema) },
				},
			},
			...authErrors,
			404: errorResponse("Delivery not found"),
			409: errorResponse("Endpoint revoked"),
			502: errorResponse("Resend may not have been queued; resend again"),
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("webhooks", "manage"),
	async (c) => {
		const owner = webhookOwner(c);
		if (!owner) return c.json({ message: "Unauthorized" }, 401);
		try {
			return c.json(
				await resendWebhookDelivery(
					c.get("dbClient"),
					c.get("inngestClient"),
					owner,
					c.req.param("id"),
				),
				202,
			);
		} catch (error) {
			return serviceErrorResponse(c, error);
		}
	},
);
