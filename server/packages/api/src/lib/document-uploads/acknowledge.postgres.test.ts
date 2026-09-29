import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect, Layer } from "effect";
import {
	acknowledgePresignedUpload,
	acknowledgeWorkflowUpload,
	replayAcknowledgedUpload,
} from "./acknowledge";
import {
	EnqueueFailed,
	UploadDatabase,
	type UploadEvent,
	UploadEvents,
	UploadStorage,
} from "./services";

// TEST_DATABASE_URL enables this check against a migrated PostgreSQL database.
// Every test runs in a transaction that is rolled back.
const databaseURL = process.env.TEST_DATABASE_URL;
const describePostgres = databaseURL ? describe : describe.skip;

async function withRollback(fn: (db: PGDB) => Promise<void>) {
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

async function seedIssuedUpload(db: PGDB) {
	const [user] = await db
		.insert(schema.users)
		.values({ name: "Ack Test", email: `${randomUUID()}@example.test` })
		.returning();
	const [organization] = await db
		.insert(schema.organizations)
		.values({ name: "Ack Org", slug: randomUUID() })
		.returning();
	const [project] = await db
		.insert(schema.projects)
		.values({
			name: "Ack Project",
			slug: randomUUID(),
			organizationId: organization.id,
		})
		.returning();
	const [key] = await db
		.insert(schema.apikeys)
		.values({
			key: randomUUID(),
			userId: user.id,
			organizationId: organization.id,
			projectId: project.id,
			kind: "workflow",
		})
		.returning();
	const [upload] = await db
		.insert(schema.presignedUploads)
		.values({
			bucket: "test",
			objectKey: `uploads/${randomUUID()}.png`,
			organizationId: organization.id,
			projectId: project.id,
			apiKeyId: key.id,
			visibility: "org",
			status: "issued",
		})
		.returning();
	return { ...upload, visibility: "org" as const };
}

const storage = Layer.succeed(
	UploadStorage,
	UploadStorage.of({
		stat: () =>
			Effect.succeed({
				size: 1024,
				lastModified: new Date("2026-09-01T00:00:00Z"),
				etag: '"etag"',
				type: "image/png",
			}),
		delete: () => Effect.void,
	}),
);

async function readUpload(db: PGDB, id: string) {
	const [row] = await db
		.select()
		.from(schema.presignedUploads)
		.where(eq(schema.presignedUploads.id, id));
	if (!row) throw new Error("upload not found");
	return { ...row, visibility: "org" as const };
}

function recordingEvents(failures: number) {
	const sent: UploadEvent[] = [];
	let remainingFailures = failures;
	const layer = Layer.succeed(
		UploadEvents,
		UploadEvents.of({
			send: (event) =>
				Effect.suspend(() => {
					if (remainingFailures > 0) {
						remainingFailures -= 1;
						return Effect.fail(
							new EnqueueFailed({
								eventId: event.id,
								cause: new Error("Inngest unavailable"),
							}),
						);
					}
					sent.push(event);
					return Effect.void;
				}),
		}),
	);
	return { sent, layer };
}

const queueProcessing = { enabled: true as const };

function run<A, E>(
	db: PGDB,
	events: Layer.Layer<UploadEvents>,
	effect: Effect.Effect<A, E, UploadStorage | UploadDatabase | UploadEvents>,
) {
	return Effect.runPromise(
		effect.pipe(
			Effect.provide(
				Layer.mergeAll(storage, events, Layer.succeed(UploadDatabase, db)),
			),
		),
	);
}

describePostgres("workflow-key upload acknowledgement", () => {
	test("a repeated acknowledgement retries a failed enqueue once", async () => {
		await withRollback(async (db) => {
			const upload = await seedIssuedUpload(db);
			const events = recordingEvents(1);
			const { sent } = events;

			const first = await run(
				db,
				events.layer,
				acknowledgePresignedUpload(upload, queueProcessing),
			);
			expect(first.processing).toEqual({
				status: "failed",
				code: "processing_enqueue_failed",
			});
			const afterFailure = await readUpload(db, upload.id);
			expect(afterFailure.status).toBe("verified");
			expect(afterFailure.processingQueuedAt).toBeNull();

			const retried = await run(
				db,
				events.layer,
				replayAcknowledgedUpload(afterFailure, queueProcessing),
			);
			expect(retried).toEqual({
				status: "verified",
				documentId: first.documentId,
				presignedUploadId: upload.id,
				processing: { status: "queued" },
			});
			expect(sent.map((event) => event.id)).toEqual([
				`document-process-upload-${first.documentId}`,
			]);

			// Once queued, later acknowledgements never send again, even after
			// Inngest's deduplication window.
			const again = await run(
				db,
				events.layer,
				replayAcknowledgedUpload(
					await readUpload(db, upload.id),
					queueProcessing,
				),
			);
			expect(again).toMatchObject({ processing: { status: "queued" } });
			expect(sent).toHaveLength(1);
			expect(
				await db
					.select()
					.from(schema.documents)
					.where(eq(schema.documents.objectKey, upload.objectKey)),
			).toHaveLength(1);
		});
	});

	test("a successful first acknowledgement records that processing was queued", async () => {
		await withRollback(async (db) => {
			const upload = await seedIssuedUpload(db);
			const events = recordingEvents(0);
			const { sent } = events;

			await run(
				db,
				events.layer,
				acknowledgePresignedUpload(upload, queueProcessing),
			);
			const verified = await readUpload(db, upload.id);
			expect(verified.processingQueuedAt).toBeInstanceOf(Date);

			await run(
				db,
				events.layer,
				replayAcknowledgedUpload(verified, queueProcessing),
			);
			expect(sent).toHaveLength(1);
		});
	});

	test("replay finds nothing for an upload that was never acknowledged", async () => {
		await withRollback(async (db) => {
			const upload = await seedIssuedUpload(db);
			expect(
				await run(
					db,
					recordingEvents(0).layer,
					replayAcknowledgedUpload(await readUpload(db, upload.id), {
						enabled: false,
						code: "workflow_unavailable",
					}),
				),
			).toBeUndefined();
		});
	});

	test("an acknowledgement that loses the race replays the winner's result", async () => {
		await withRollback(async (db) => {
			const upload = await seedIssuedUpload(db);
			const events = recordingEvents(0);

			const winner = await run(
				db,
				events.layer,
				acknowledgePresignedUpload(upload, queueProcessing),
			);
			// The loser read the upload while it was still issued.
			const loser = await run(
				db,
				events.layer,
				acknowledgeWorkflowUpload(
					{ ...upload, status: "issued", processingQueuedAt: null },
					queueProcessing,
				),
			);

			expect(loser).toEqual({
				status: "verified",
				documentId: winner.documentId,
				presignedUploadId: upload.id,
				processing: { status: "queued" },
			});
			expect(
				await db
					.select()
					.from(schema.documents)
					.where(eq(schema.documents.objectKey, upload.objectKey)),
			).toHaveLength(1);
		});
	});
});
