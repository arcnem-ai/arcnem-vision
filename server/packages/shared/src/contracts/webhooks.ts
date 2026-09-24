import { z } from "zod";

export const WEBHOOK_EVENT_TYPES = [
	"workflow.completed",
	"workflow.failed",
] as const;
export const WEBHOOK_ENDPOINT_STATUSES = ["enabled", "revoked"] as const;
export const WEBHOOK_DELIVERY_STATUSES = [
	"pending",
	"delivered",
	"failed",
	"cancelled",
] as const;
export const WEBHOOK_ATTEMPT_OUTCOMES = [
	"pending",
	"succeeded",
	"retryable",
	"rejected",
] as const;
export const WEBHOOK_ATTEMPT_ERROR_CATEGORIES = [
	"dns",
	"blocked_destination",
	"timeout",
	"network",
] as const;

export type WebhookEndpointStatus = (typeof WEBHOOK_ENDPOINT_STATUSES)[number];
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];
export type WebhookAttemptOutcome = (typeof WEBHOOK_ATTEMPT_OUTCOMES)[number];
export type WebhookAttemptErrorCategory =
	(typeof WEBHOOK_ATTEMPT_ERROR_CATEGORIES)[number];

export const webhookEndpointCreateRequestSchema = z.object({
	url: z.string().trim().min(1).max(2048),
});

export type WebhookEndpointCreateRequest = z.infer<
	typeof webhookEndpointCreateRequestSchema
>;

export const webhookEndpointSchema = z.object({
	id: z.string().min(1),
	apiKeyId: z.string().min(1),
	url: z.string().min(1),
	status: z.enum(WEBHOOK_ENDPOINT_STATUSES),
	createdAt: z.string().min(1),
	revokedAt: z.string().nullable(),
});

export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

export const webhookEndpointCreatedSchema = z.object({
	endpoint: webhookEndpointSchema,
	// Shown once. Verify deliveries with it; it cannot be read again.
	signingSecret: z.string().min(1),
});

export type WebhookEndpointCreated = z.infer<
	typeof webhookEndpointCreatedSchema
>;

export const webhookEndpointsResponseSchema = z.object({
	endpoints: z.array(webhookEndpointSchema),
});

export const webhookDeliveryAttemptSchema = z.object({
	attemptNumber: z.number().int().positive(),
	outcome: z.enum(WEBHOOK_ATTEMPT_OUTCOMES),
	httpStatus: z.number().int().nullable(),
	errorCategory: z.enum(WEBHOOK_ATTEMPT_ERROR_CATEGORIES).nullable(),
	startedAt: z.string().min(1),
	finishedAt: z.string().nullable(),
});

export const webhookDeliverySchema = z.object({
	id: z.string().min(1),
	endpointId: z.string().min(1),
	executionId: z.string().min(1),
	eventId: z.string().min(1),
	eventType: z.enum(WEBHOOK_EVENT_TYPES),
	status: z.enum(WEBHOOK_DELIVERY_STATUSES),
	createdAt: z.string().min(1),
	updatedAt: z.string().min(1),
	attempts: z.array(webhookDeliveryAttemptSchema),
});

export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookDeliveryListQuerySchema = z.object({
	endpointId: z.string().min(1).optional(),
	executionId: z.string().min(1).optional(),
	limit: z.number().int().positive().max(100).optional(),
	cursor: z.string().min(1).optional(),
});

export type WebhookDeliveryListQuery = z.infer<
	typeof webhookDeliveryListQuerySchema
>;

export const webhookDeliveriesResponseSchema = z.object({
	deliveries: z.array(webhookDeliverySchema),
	nextCursor: z.string().nullable(),
});

export type WebhookDeliveriesResponse = z.infer<
	typeof webhookDeliveriesResponseSchema
>;

// Dashboard inputs name the service key whose webhooks are being managed.
export const dashboardWebhookKeyInputSchema = z.object({
	apiKeyId: z.string().min(1),
});

export const dashboardWebhookEndpointCreateInputSchema =
	webhookEndpointCreateRequestSchema.extend({
		apiKeyId: z.string().min(1),
	});

export const dashboardWebhookEndpointRevokeInputSchema = z.object({
	apiKeyId: z.string().min(1),
	endpointId: z.string().min(1),
});

export const dashboardWebhookDeliveriesInputSchema =
	webhookDeliveryListQuerySchema.extend({
		apiKeyId: z.string().min(1),
	});

export const dashboardWebhookDeliveryResendInputSchema = z.object({
	apiKeyId: z.string().min(1),
	deliveryId: z.string().min(1),
});
