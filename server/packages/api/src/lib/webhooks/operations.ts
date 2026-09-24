import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import type {
	WebhookDeliveriesResponse,
	WebhookDelivery,
	WebhookDeliveryListQuery,
	WebhookEndpoint,
	WebhookEndpointCreated,
} from "@arcnem-vision/shared";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Inngest } from "inngest";
import { resolvePublicHttpsDestination } from "@/lib/public-https";
import { ServiceError } from "@/lib/service-error";
import {
	encryptSigningSecret,
	generateSigningSecret,
} from "@/lib/webhooks/signing";

const { webhookDeliveries, webhookDeliveryAttempts, webhookEndpoints } = schema;

export const WEBHOOK_DELIVERY_REQUESTED_EVENT = "webhook/delivery.requested";
export const MAX_ENABLED_WEBHOOK_ENDPOINTS_PER_KEY = 5;
const DEFAULT_DELIVERY_PAGE_SIZE = 25;

// The service key that owns the endpoints. Callers authorize it before calling in.
export type WebhookOwner = {
	projectId: string;
	apiKeyId: string;
};

export type WebhookDestinationPolicy = {
	// Local development only: allow http:// and private addresses.
	allowPrivateHttp: boolean;
};

const WEBHOOK_REGISTRATION_DNS_TIMEOUT_MS = 5_000;

export async function validateWebhookUrl(
	value: string,
	policy: WebhookDestinationPolicy,
	resolve: (url: URL) => Promise<unknown> = resolvePublicHttpsDestination,
	timeoutMs = WEBHOOK_REGISTRATION_DNS_TIMEOUT_MS,
) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new ServiceError(400, "Webhook URL is not a valid URL");
	}
	const allowedProtocol =
		url.protocol === "https:" ||
		(policy.allowPrivateHttp && url.protocol === "http:");
	if (!allowedProtocol || url.username || url.password || url.hash)
		throw new ServiceError(
			400,
			"Webhook URL must use HTTPS and cannot include credentials or a fragment",
		);
	if (policy.allowPrivateHttp) return url;
	// Bound the lookup so a slow resolver cannot hold registration requests open.
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			resolve(url),
			new Promise((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("DNS lookup timed out")),
					timeoutMs,
				);
			}),
		]);
	} catch (error) {
		throw new ServiceError(
			400,
			error instanceof TypeError
				? "Webhook URL must resolve only to public addresses"
				: "Webhook URL host could not be resolved",
		);
	} finally {
		clearTimeout(timer);
	}
	return url;
}

function toWebhookEndpoint(
	row: typeof webhookEndpoints.$inferSelect,
): WebhookEndpoint {
	return {
		id: row.id,
		apiKeyId: row.apiKeyId,
		url: row.url,
		status: row.status === "revoked" ? "revoked" : "enabled",
		createdAt: row.createdAt.toISOString(),
		revokedAt: row.revokedAt?.toISOString() ?? null,
	};
}

export async function createWebhookEndpoint(
	dbClient: PGDB,
	owner: WebhookOwner,
	input: { url: string },
	policy: WebhookDestinationPolicy,
): Promise<WebhookEndpointCreated> {
	const url = await validateWebhookUrl(input.url, policy);
	const signingSecret = generateSigningSecret();
	const signingSecretCiphertext = encryptSigningSecret(signingSecret);

	const created = await dbClient.transaction(async (tx) => {
		// Serialize endpoint creation per key so the cap cannot be raced past.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${owner.apiKeyId}, 0))`,
		);
		const [{ count }] = await tx
			.select({ count: sql<number>`count(*)::int` })
			.from(webhookEndpoints)
			.where(
				and(
					eq(webhookEndpoints.apiKeyId, owner.apiKeyId),
					eq(webhookEndpoints.status, "enabled"),
				),
			);
		if (count >= MAX_ENABLED_WEBHOOK_ENDPOINTS_PER_KEY)
			throw new ServiceError(
				409,
				`A key can have at most ${MAX_ENABLED_WEBHOOK_ENDPOINTS_PER_KEY} enabled webhook endpoints`,
			);
		const [row] = await tx
			.insert(webhookEndpoints)
			.values({
				apiKeyId: owner.apiKeyId,
				projectId: owner.projectId,
				url: url.toString(),
				signingSecretCiphertext,
			})
			.returning();
		return row;
	});

	return { endpoint: toWebhookEndpoint(created), signingSecret };
}

export async function listWebhookEndpoints(
	dbClient: PGDB,
	owner: WebhookOwner,
): Promise<WebhookEndpoint[]> {
	const rows = await dbClient
		.select()
		.from(webhookEndpoints)
		.where(
			and(
				eq(webhookEndpoints.apiKeyId, owner.apiKeyId),
				eq(webhookEndpoints.projectId, owner.projectId),
			),
		)
		.orderBy(desc(webhookEndpoints.id));
	return rows.map(toWebhookEndpoint);
}

export async function revokeWebhookEndpoint(
	dbClient: PGDB,
	owner: WebhookOwner,
	endpointId: string,
): Promise<WebhookEndpoint> {
	if (!isUUID(endpointId))
		throw new ServiceError(404, "Webhook endpoint not found");
	const [existing] = await dbClient
		.select()
		.from(webhookEndpoints)
		.where(ownedEndpoint(owner, endpointId))
		.limit(1);
	if (!existing) throw new ServiceError(404, "Webhook endpoint not found");
	if (existing.status === "revoked") return toWebhookEndpoint(existing);

	const [revoked] = await dbClient
		.update(webhookEndpoints)
		.set({ status: "revoked", revokedAt: new Date() })
		.where(ownedEndpoint(owner, endpointId))
		.returning();
	return toWebhookEndpoint(revoked);
}

function ownedEndpoint(owner: WebhookOwner, endpointId: string) {
	return and(
		eq(webhookEndpoints.id, endpointId),
		eq(webhookEndpoints.apiKeyId, owner.apiKeyId),
		eq(webhookEndpoints.projectId, owner.projectId),
	);
}

function isUUID(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

export async function listWebhookDeliveries(
	dbClient: PGDB,
	owner: WebhookOwner,
	query: WebhookDeliveryListQuery,
): Promise<WebhookDeliveriesResponse> {
	for (const [name, value] of [
		["endpointId", query.endpointId],
		["executionId", query.executionId],
		["cursor", query.cursor],
	] as const) {
		if (value !== undefined && !isUUID(value))
			throw new ServiceError(400, `${name} must be a UUID`);
	}
	const limit = query.limit ?? DEFAULT_DELIVERY_PAGE_SIZE;
	const rows = await dbClient
		.select({ delivery: webhookDeliveries })
		.from(webhookDeliveries)
		.innerJoin(
			webhookEndpoints,
			eq(webhookEndpoints.id, webhookDeliveries.endpointId),
		)
		.where(
			and(
				eq(webhookEndpoints.apiKeyId, owner.apiKeyId),
				eq(webhookEndpoints.projectId, owner.projectId),
				query.endpointId
					? eq(webhookDeliveries.endpointId, query.endpointId)
					: undefined,
				query.executionId
					? eq(webhookDeliveries.runId, query.executionId)
					: undefined,
				query.cursor ? lt(webhookDeliveries.id, query.cursor) : undefined,
			),
		)
		.orderBy(desc(webhookDeliveries.id))
		.limit(limit + 1);

	const page = rows.slice(0, limit).map((row) => row.delivery);
	const attempts = page.length
		? await dbClient
				.select()
				.from(webhookDeliveryAttempts)
				.where(
					inArray(
						webhookDeliveryAttempts.deliveryId,
						page.map((delivery) => delivery.id),
					),
				)
				.orderBy(webhookDeliveryAttempts.attemptNumber)
		: [];

	return {
		deliveries: page.map((delivery) =>
			toWebhookDelivery(
				delivery,
				attempts.filter((attempt) => attempt.deliveryId === delivery.id),
			),
		),
		nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
	};
}

function toWebhookDelivery(
	delivery: typeof webhookDeliveries.$inferSelect,
	attempts: (typeof webhookDeliveryAttempts.$inferSelect)[],
): WebhookDelivery {
	return {
		id: delivery.id,
		endpointId: delivery.endpointId,
		executionId: delivery.runId,
		eventId: delivery.eventId,
		eventType:
			delivery.eventType === "workflow.failed"
				? "workflow.failed"
				: "workflow.completed",
		status: toDeliveryStatus(delivery.status),
		createdAt: delivery.createdAt.toISOString(),
		updatedAt: delivery.updatedAt.toISOString(),
		attempts: attempts.map((attempt) => ({
			attemptNumber: attempt.attemptNumber,
			outcome: toAttemptOutcome(attempt.outcome),
			httpStatus: attempt.httpStatus,
			errorCategory: toErrorCategory(attempt.errorCategory),
			startedAt: attempt.startedAt.toISOString(),
			finishedAt: attempt.finishedAt?.toISOString() ?? null,
		})),
	};
}

function toDeliveryStatus(value: string): WebhookDelivery["status"] {
	return value === "delivered" || value === "failed" || value === "cancelled"
		? value
		: "pending";
}

function toAttemptOutcome(
	value: string,
): WebhookDelivery["attempts"][number]["outcome"] {
	return value === "succeeded" || value === "retryable" || value === "rejected"
		? value
		: "pending";
}

function toErrorCategory(
	value: string | null,
): WebhookDelivery["attempts"][number]["errorCategory"] {
	return value === "dns" ||
		value === "blocked_destination" ||
		value === "timeout" ||
		value === "network"
		? value
		: null;
}

// Re-sends the same event ID and body to the original endpoint and keeps history.
// Each resend is a new dispatch, so it supersedes any earlier request for the
// delivery, and repeating a resend whose queueing was uncertain is always safe.
export async function resendWebhookDelivery(
	dbClient: PGDB,
	inngestClient: Inngest,
	owner: WebhookOwner,
	deliveryId: string,
): Promise<WebhookDelivery> {
	if (!isUUID(deliveryId))
		throw new ServiceError(404, "Webhook delivery not found");
	const [row] = await dbClient
		.select({ endpointStatus: webhookEndpoints.status })
		.from(webhookDeliveries)
		.innerJoin(
			webhookEndpoints,
			eq(webhookEndpoints.id, webhookDeliveries.endpointId),
		)
		.where(
			and(
				eq(webhookDeliveries.id, deliveryId),
				eq(webhookEndpoints.apiKeyId, owner.apiKeyId),
				eq(webhookEndpoints.projectId, owner.projectId),
			),
		)
		.limit(1);
	if (!row) throw new ServiceError(404, "Webhook delivery not found");
	if (row.endpointStatus !== "enabled")
		throw new ServiceError(409, "Webhook endpoint is revoked");

	const [queued] = await dbClient
		.update(webhookDeliveries)
		.set({
			status: "pending",
			dispatchId: sql`uuidv7()`,
			updatedAt: new Date(),
		})
		.where(eq(webhookDeliveries.id, deliveryId))
		.returning();

	try {
		await inngestClient.send({
			id: `webhook-dispatch-${queued.dispatchId}`,
			name: WEBHOOK_DELIVERY_REQUESTED_EVENT,
			data: { deliveryId, dispatchId: queued.dispatchId },
		});
	} catch {
		// The event may still have been accepted, so the new dispatch stays current.
		throw new ServiceError(
			502,
			"The resend may not have been queued. Resend again to retry.",
		);
	}

	const attempts = await dbClient
		.select()
		.from(webhookDeliveryAttempts)
		.where(eq(webhookDeliveryAttempts.deliveryId, deliveryId))
		.orderBy(webhookDeliveryAttempts.attemptNumber);
	return toWebhookDelivery(queued, attempts);
}
