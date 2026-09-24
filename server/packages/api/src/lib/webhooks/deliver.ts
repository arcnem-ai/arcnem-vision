import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import type { WebhookAttemptErrorCategory } from "@arcnem-vision/shared";
import { and, eq, sql } from "drizzle-orm";
import { type Inngest, NonRetriableError } from "inngest";
import {
	type PublicHttpsPostResult,
	postToPublicHttps,
} from "@/lib/public-https";
import {
	WEBHOOK_DELIVERY_REQUESTED_EVENT,
	type WebhookDestinationPolicy,
} from "@/lib/webhooks/operations";
import { decryptSigningSecret, signWebhook } from "@/lib/webhooks/signing";

const {
	apikeys,
	webhookDeliveries,
	webhookDeliveryAttempts,
	webhookEndpoints,
} = schema;

// Inngest owns the retry schedule; each run of the function is one HTTP attempt.
export const WEBHOOK_DELIVERY_RETRIES = 3;
const WEBHOOK_TIMEOUT_MS = 10_000;

export type WebhookPostResult = PublicHttpsPostResult;
export type WebhookPoster = (input: {
	url: URL;
	headers: Record<string, string>;
	body: string;
	timeoutMs: number;
	policy: WebhookDestinationPolicy;
}) => Promise<WebhookPostResult>;

// One send request for a delivery. A resend gets a new dispatch ID; runs holding an
// older one skip, so they can never overwrite the newer request's outcome.
export type WebhookDispatch = { deliveryId: string; dispatchId: string };

export type WebhookAttemptResult =
	| { outcome: "delivered" }
	| {
			outcome: "skipped";
			reason: "missing" | "stale" | "not_pending" | "ineligible";
	  }
	| { outcome: "retryable"; message: string }
	| { outcome: "rejected"; message: string };

export function isRetryableWebhookResult(result: WebhookPostResult) {
	if (result.kind === "error") return result.category !== "blocked_destination";
	return result.status === 408 || result.status === 429 || result.status >= 500;
}

async function postWebhookLocally(input: Parameters<WebhookPoster>[0]) {
	try {
		const response = await fetch(input.url, {
			method: "POST",
			headers: input.headers,
			body: input.body,
			redirect: "manual",
			signal: AbortSignal.timeout(input.timeoutMs),
		});
		await response.body?.cancel();
		return { kind: "response", status: response.status } as const;
	} catch (error) {
		return {
			kind: "error",
			category:
				error instanceof DOMException && error.name === "TimeoutError"
					? "timeout"
					: "network",
		} as const;
	}
}

export const postWebhook: WebhookPoster = (input) =>
	input.policy.allowPrivateHttp
		? postWebhookLocally(input)
		: postToPublicHttps(input);

// One delivery attempt. Postgres records it; the caller maps retryable results to
// thrown errors so Inngest schedules the retry.
export async function attemptWebhookDelivery(
	dbClient: PGDB,
	dispatch: WebhookDispatch,
	policy: WebhookDestinationPolicy,
	post: WebhookPoster = postWebhook,
	now: () => Date = () => new Date(),
): Promise<WebhookAttemptResult> {
	const [row] = await dbClient
		.select({
			delivery: webhookDeliveries,
			endpoint: webhookEndpoints,
			keyEnabled: apikeys.enabled,
			keyExpiresAt: apikeys.expiresAt,
			keyProjectId: apikeys.projectId,
		})
		.from(webhookDeliveries)
		.innerJoin(
			webhookEndpoints,
			eq(webhookEndpoints.id, webhookDeliveries.endpointId),
		)
		.innerJoin(apikeys, eq(apikeys.id, webhookEndpoints.apiKeyId))
		.where(eq(webhookDeliveries.id, dispatch.deliveryId))
		.limit(1);
	if (!row) return { outcome: "skipped", reason: "missing" };
	if (row.delivery.dispatchId !== dispatch.dispatchId)
		return { outcome: "skipped", reason: "stale" };
	if (row.delivery.status !== "pending")
		return { outcome: "skipped", reason: "not_pending" };

	const eligible =
		row.endpoint.status === "enabled" &&
		row.keyEnabled &&
		row.keyProjectId === row.endpoint.projectId &&
		(!row.keyExpiresAt || row.keyExpiresAt > now());
	if (!eligible) {
		await setDeliveryStatus(dbClient, dispatch, "cancelled");
		return { outcome: "skipped", reason: "ineligible" };
	}

	const [attempt] = await dbClient
		.insert(webhookDeliveryAttempts)
		.values({
			deliveryId: dispatch.deliveryId,
			attemptNumber: sql`(select coalesce(max(${webhookDeliveryAttempts.attemptNumber}), 0) + 1 from ${webhookDeliveryAttempts} where ${webhookDeliveryAttempts.deliveryId} = ${dispatch.deliveryId})`,
		})
		.returning({ id: webhookDeliveryAttempts.id });

	const timestamp = Math.floor(now().getTime() / 1000);
	const secret = decryptSigningSecret(row.endpoint.signingSecretCiphertext);
	const result = await post({
		url: new URL(row.endpoint.url),
		body: row.delivery.body,
		headers: {
			"content-type": "application/json",
			"user-agent": "Arcnem-Vision-Webhooks/1",
			"webhook-id": row.delivery.eventId,
			"webhook-timestamp": String(timestamp),
			"webhook-signature": signWebhook(
				secret,
				row.delivery.eventId,
				timestamp,
				row.delivery.body,
			),
		},
		timeoutMs: WEBHOOK_TIMEOUT_MS,
		policy,
	});

	const delivered =
		result.kind === "response" && result.status >= 200 && result.status < 300;
	const retryable = !delivered && isRetryableWebhookResult(result);
	await dbClient
		.update(webhookDeliveryAttempts)
		.set({
			outcome: delivered ? "succeeded" : retryable ? "retryable" : "rejected",
			httpStatus: result.kind === "response" ? result.status : null,
			errorCategory:
				result.kind === "error"
					? (result.category satisfies WebhookAttemptErrorCategory)
					: null,
			finishedAt: now(),
		})
		.where(eq(webhookDeliveryAttempts.id, attempt.id));

	if (delivered) {
		await setDeliveryStatus(dbClient, dispatch, "delivered");
		return { outcome: "delivered" };
	}
	const message =
		result.kind === "response"
			? `Receiver responded with HTTP ${result.status}`
			: `Delivery failed: ${result.category}`;
	if (retryable) return { outcome: "retryable", message };
	await setDeliveryStatus(dbClient, dispatch, "failed");
	return { outcome: "rejected", message };
}

// Settles a pending delivery only for the dispatch that is still current.
export async function setDeliveryStatus(
	dbClient: PGDB,
	dispatch: WebhookDispatch,
	status: "delivered" | "failed" | "cancelled",
) {
	await dbClient
		.update(webhookDeliveries)
		.set({ status, updatedAt: new Date() })
		.where(
			and(
				eq(webhookDeliveries.id, dispatch.deliveryId),
				eq(webhookDeliveries.dispatchId, dispatch.dispatchId),
				eq(webhookDeliveries.status, "pending"),
			),
		);
}

function readDispatch(data: unknown): WebhookDispatch | null {
	if (!data || typeof data !== "object") return null;
	const { deliveryId, dispatchId } = data as Record<string, unknown>;
	return typeof deliveryId === "string" && typeof dispatchId === "string"
		? { deliveryId, dispatchId }
		: null;
}

export function createWebhookDeliveryFunction(
	inngestClient: Inngest,
	getDBClient: () => PGDB,
	policy: WebhookDestinationPolicy,
) {
	return inngestClient.createFunction(
		{
			id: "webhook-deliver",
			retries: WEBHOOK_DELIVERY_RETRIES,
			concurrency: { limit: 10 },
			triggers: [{ event: WEBHOOK_DELIVERY_REQUESTED_EVENT }],
			onFailure: async ({ event }) => {
				const dispatch = readDispatch(event.data.event.data);
				if (dispatch)
					await setDeliveryStatus(getDBClient(), dispatch, "failed");
			},
		},
		async ({ event }) => {
			const dispatch = readDispatch(event.data);
			if (!dispatch)
				throw new NonRetriableError(
					"Webhook delivery event needs deliveryId and dispatchId",
				);
			const result = await attemptWebhookDelivery(
				getDBClient(),
				dispatch,
				policy,
			);
			if (result.outcome === "retryable") throw new Error(result.message);
			if (result.outcome === "rejected")
				throw new NonRetriableError(result.message);
			return result;
		},
	);
}
