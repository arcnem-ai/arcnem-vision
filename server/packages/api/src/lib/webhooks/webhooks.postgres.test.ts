import { describe, expect, test } from "bun:test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Inngest } from "inngest";
import { ServiceError } from "@/lib/service-error";
import {
	attemptWebhookDelivery,
	setDeliveryStatus,
	type WebhookPoster,
	type WebhookPostResult,
} from "./deliver";
import {
	createWebhookEndpoint,
	listWebhookDeliveries,
	listWebhookEndpoints,
	MAX_ENABLED_WEBHOOK_ENDPOINTS_PER_KEY,
	resendWebhookDelivery,
	revokeWebhookEndpoint,
	type WebhookOwner,
} from "./operations";

// WEBHOOK_TEST_DATABASE_URL enables this check against a migrated PostgreSQL
// database. Every test runs in a transaction that is rolled back.
const databaseURL = process.env.WEBHOOK_TEST_DATABASE_URL;
const describePostgres = databaseURL ? describe : describe.skip;
const policy = { allowPrivateHttp: true };

async function withRollback(fn: (db: PGDB) => Promise<void>) {
	process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ??=
		randomBytes(32).toString("base64");
	const db = drizzle({
		connection: { connectionString: databaseURL },
		casing: "snake_case",
		schema,
	}) as PGDB;
	try {
		await db.transaction(async (tx) => {
			await fn(tx as unknown as PGDB);
			tx.rollback();
		});
	} catch (error) {
		if (!(error instanceof TransactionRollbackError)) throw error;
	} finally {
		await db.$client.end();
	}
}

async function seedServiceKey(db: PGDB) {
	const [user] = await db
		.insert(schema.users)
		.values({ name: "Webhook Test", email: `${randomUUID()}@example.test` })
		.returning();
	const [organization] = await db
		.insert(schema.organizations)
		.values({ name: "Webhook Org", slug: randomUUID() })
		.returning();
	const [project] = await db
		.insert(schema.projects)
		.values({
			name: "Webhook Project",
			slug: randomUUID(),
			organizationId: organization.id,
		})
		.returning();
	const newKey = async () => {
		const [key] = await db
			.insert(schema.apikeys)
			.values({
				key: randomUUID(),
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				kind: "service",
			})
			.returning();
		return key;
	};
	const key = await newKey();
	const [graph] = await db
		.insert(schema.agentGraphs)
		.values({
			name: "Webhook Graph",
			entryNode: "start",
			organizationId: organization.id,
		})
		.returning();
	const [run] = await db
		.insert(schema.agentGraphRuns)
		.values({
			agentGraphId: graph.id,
			projectId: project.id,
			apiKeyId: key.id,
			status: "completed",
		})
		.returning();
	const owner: WebhookOwner = { projectId: project.id, apiKeyId: key.id };
	return { owner, run, newKey, projectId: project.id };
}

async function queueDelivery(db: PGDB, endpointId: string, runId: string) {
	const body = `{"type":"workflow.completed","data":{"executionId":"${runId}"}}`;
	const [delivery] = await db
		.insert(schema.webhookDeliveries)
		.values({
			endpointId,
			runId,
			eventId: `evt_${runId}`,
			eventType: "workflow.completed",
			body,
		})
		.returning();
	return delivery;
}

const dispatchOf = (delivery: { id: string; dispatchId: string }) => ({
	deliveryId: delivery.id,
	dispatchId: delivery.dispatchId,
});

function fakePoster(...results: WebhookPostResult[]) {
	const requests: Parameters<WebhookPoster>[0][] = [];
	const post: WebhookPoster = async (input) => {
		requests.push(input);
		const result = results.shift();
		if (!result) throw new Error("unexpected webhook request");
		return result;
	};
	return { post, requests };
}

async function deliveryStatus(db: PGDB, id: string) {
	const [row] = await db
		.select({ status: schema.webhookDeliveries.status })
		.from(schema.webhookDeliveries)
		.where(eq(schema.webhookDeliveries.id, id));
	return row?.status;
}

describePostgres("workflow webhooks (PostgreSQL)", () => {
	test("endpoints belong to their key, return the secret once, and are capped", async () => {
		await withRollback(async (db) => {
			const { owner, newKey, projectId } = await seedServiceKey(db);
			const created = await createWebhookEndpoint(
				db,
				owner,
				{ url: "https://receiver.example/hooks" },
				policy,
			);
			expect(created.signingSecret).toStartWith("whsec_");
			expect(
				JSON.stringify(await listWebhookEndpoints(db, owner)),
			).not.toContain(created.signingSecret);

			const otherOwner = { projectId, apiKeyId: (await newKey()).id };
			expect(await listWebhookEndpoints(db, otherOwner)).toEqual([]);
			await expect(
				revokeWebhookEndpoint(db, otherOwner, created.endpoint.id),
			).rejects.toThrow("Webhook endpoint not found");

			for (let i = 1; i < MAX_ENABLED_WEBHOOK_ENDPOINTS_PER_KEY; i++)
				await createWebhookEndpoint(
					db,
					owner,
					{ url: `https://receiver.example/hooks/${i}` },
					policy,
				);
			const overLimit = createWebhookEndpoint(
				db,
				owner,
				{ url: "https://receiver.example/too-many" },
				policy,
			);
			await expect(overLimit).rejects.toBeInstanceOf(ServiceError);
			await expect(overLimit).rejects.toThrow("at most");
		});
	});

	test("delivers a signed request and records the attempt", async () => {
		await withRollback(async (db) => {
			const { owner, run } = await seedServiceKey(db);
			const { endpoint, signingSecret } = await createWebhookEndpoint(
				db,
				owner,
				{ url: "https://receiver.example/hooks" },
				policy,
			);
			const delivery = await queueDelivery(db, endpoint.id, run.id);
			const receiver = fakePoster({ kind: "response", status: 204 });

			const result = await attemptWebhookDelivery(
				db,
				dispatchOf(delivery),
				policy,
				receiver.post,
				() => new Date("2026-09-24T10:15:03Z"),
			);

			expect(result).toEqual({ outcome: "delivered" });
			const [request] = receiver.requests;
			expect(request.body).toBe(delivery.body);
			expect(request.headers["webhook-id"]).toBe(`evt_${run.id}`);
			expect(request.headers["webhook-timestamp"]).toBe("1790244903");
			const key = Buffer.from(signingSecret.slice(6), "base64");
			const expected = createHmac("sha256", key)
				.update(`evt_${run.id}.1790244903.${delivery.body}`)
				.digest("base64");
			expect(request.headers["webhook-signature"]).toBe(`v1,${expected}`);
			const history = await listWebhookDeliveries(db, owner, {});
			expect(history.deliveries[0]).toMatchObject({
				status: "delivered",
				attempts: [{ attemptNumber: 1, outcome: "succeeded", httpStatus: 204 }],
			});
		});
	});

	test("keeps retryable failures pending and fails rejected ones", async () => {
		await withRollback(async (db) => {
			const { owner, run } = await seedServiceKey(db);
			const { endpoint } = await createWebhookEndpoint(
				db,
				owner,
				{ url: "https://receiver.example/hooks" },
				policy,
			);
			const delivery = await queueDelivery(db, endpoint.id, run.id);
			const receiver = fakePoster(
				{ kind: "response", status: 503 },
				{ kind: "error", category: "timeout" },
				{ kind: "response", status: 400 },
			);

			for (let i = 0; i < 2; i++) {
				const result = await attemptWebhookDelivery(
					db,
					dispatchOf(delivery),
					policy,
					receiver.post,
				);
				expect(result.outcome).toBe("retryable");
				expect(await deliveryStatus(db, delivery.id)).toBe("pending");
			}
			expect(
				await attemptWebhookDelivery(
					db,
					dispatchOf(delivery),
					policy,
					receiver.post,
				),
			).toMatchObject({ outcome: "rejected" });
			expect(await deliveryStatus(db, delivery.id)).toBe("failed");
			const [history] = (await listWebhookDeliveries(db, owner, {})).deliveries;
			expect(
				history.attempts.map(({ attemptNumber, outcome, errorCategory }) => ({
					attemptNumber,
					outcome,
					errorCategory,
				})),
			).toEqual([
				{ attemptNumber: 1, outcome: "retryable", errorCategory: null },
				{ attemptNumber: 2, outcome: "retryable", errorCategory: "timeout" },
				{ attemptNumber: 3, outcome: "rejected", errorCategory: null },
			]);
		});
	});

	test("cancels deliveries whose endpoint was revoked without sending", async () => {
		await withRollback(async (db) => {
			const { owner, run } = await seedServiceKey(db);
			const { endpoint } = await createWebhookEndpoint(
				db,
				owner,
				{ url: "https://receiver.example/hooks" },
				policy,
			);
			const delivery = await queueDelivery(db, endpoint.id, run.id);
			await revokeWebhookEndpoint(db, owner, endpoint.id);
			const receiver = fakePoster();

			expect(
				await attemptWebhookDelivery(
					db,
					dispatchOf(delivery),
					policy,
					receiver.post,
				),
			).toEqual({ outcome: "skipped", reason: "ineligible" });
			expect(receiver.requests).toHaveLength(0);
			expect(await deliveryStatus(db, delivery.id)).toBe("cancelled");
		});
	});

	test("a resend supersedes earlier dispatches, even when queueing is uncertain", async () => {
		await withRollback(async (db) => {
			const { owner, run, newKey, projectId } = await seedServiceKey(db);
			const { endpoint } = await createWebhookEndpoint(
				db,
				owner,
				{ url: "https://receiver.example/hooks" },
				policy,
			);
			const delivery = await queueDelivery(db, endpoint.id, run.id);
			const original = dispatchOf(delivery);
			await attemptWebhookDelivery(
				db,
				original,
				policy,
				fakePoster({ kind: "response", status: 410 }).post,
			);
			const sent: { id: string; data: { dispatchId: string } }[] = [];
			let failSend = false;
			const inngest = {
				send: async (event: { id: string; data: { dispatchId: string } }) => {
					sent.push(event);
					if (failSend) throw new Error("response lost");
					return { ids: [event.id] };
				},
			} as unknown as Inngest;

			const otherOwner = { projectId, apiKeyId: (await newKey()).id };
			await expect(
				resendWebhookDelivery(db, inngest, otherOwner, delivery.id),
			).rejects.toThrow("Webhook delivery not found");

			const resent = await resendWebhookDelivery(
				db,
				inngest,
				owner,
				delivery.id,
			);
			expect(resent).toMatchObject({
				status: "pending",
				eventId: `evt_${run.id}`,
				attempts: [{ attemptNumber: 1, outcome: "rejected" }],
			});
			const [first] = sent;
			expect(first.data.dispatchId).not.toBe(original.dispatchId);
			expect(first.id).toBe(`webhook-dispatch-${first.data.dispatchId}`);

			// The superseded run neither sends nor settles the new request.
			const stale = fakePoster();
			expect(
				await attemptWebhookDelivery(db, original, policy, stale.post),
			).toEqual({ outcome: "skipped", reason: "stale" });
			expect(stale.requests).toHaveLength(0);
			await setDeliveryStatus(db, original, "failed");
			expect(await deliveryStatus(db, delivery.id)).toBe("pending");

			// An uncertain send keeps the new dispatch; resending again is safe.
			failSend = true;
			await expect(
				resendWebhookDelivery(db, inngest, owner, delivery.id),
			).rejects.toThrow("Resend again");
			expect(await deliveryStatus(db, delivery.id)).toBe("pending");
			failSend = false;
			await resendWebhookDelivery(db, inngest, owner, delivery.id);
			const latest = sent.at(-1)?.data.dispatchId ?? "";
			expect(new Set(sent.map((event) => event.data.dispatchId)).size).toBe(3);
			expect(
				await attemptWebhookDelivery(
					db,
					{ deliveryId: delivery.id, dispatchId: first.data.dispatchId },
					policy,
					stale.post,
				),
			).toEqual({ outcome: "skipped", reason: "stale" });
			expect(
				await attemptWebhookDelivery(
					db,
					{ deliveryId: delivery.id, dispatchId: latest },
					policy,
					fakePoster({ kind: "response", status: 200 }).post,
				),
			).toEqual({ outcome: "delivered" });
		});
	});
});
