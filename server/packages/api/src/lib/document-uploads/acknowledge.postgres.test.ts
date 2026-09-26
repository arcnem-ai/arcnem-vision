import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import type { S3Client } from "bun";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Inngest } from "inngest";
import {
	acknowledgePresignedUpload,
	replayAcknowledgedUpload,
} from "./acknowledge";

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

const storage = {
	stat: async () => ({
		size: 1024,
		lastModified: new Date("2026-09-01T00:00:00Z"),
		etag: '"etag"',
		type: "image/png",
	}),
} as unknown as S3Client;

async function readUpload(db: PGDB, id: string) {
	const [row] = await db
		.select()
		.from(schema.presignedUploads)
		.where(eq(schema.presignedUploads.id, id));
	if (!row) throw new Error("upload not found");
	return { ...row, visibility: "org" as const };
}

function recordingInngest(failures: number) {
	const sent: { id?: string; name: string }[] = [];
	let remainingFailures = failures;
	const inngestClient = {
		send: async (event: { id?: string; name: string }) => {
			if (remainingFailures > 0) {
				remainingFailures -= 1;
				throw new Error("Inngest unavailable");
			}
			sent.push(event);
		},
	} as unknown as Inngest;
	return { sent, queueProcessing: { enabled: true as const, inngestClient } };
}

describePostgres("workflow-key upload acknowledgement", () => {
	test("a repeated acknowledgement retries a failed enqueue once", async () => {
		await withRollback(async (db) => {
			const upload = await seedIssuedUpload(db);
			const { sent, queueProcessing } = recordingInngest(1);

			const first = await acknowledgePresignedUpload({
				dbClient: db,
				s3Client: storage,
				upload,
				queueProcessing,
			});
			expect(first.processing).toEqual({
				status: "failed",
				code: "processing_enqueue_failed",
			});
			const afterFailure = await readUpload(db, upload.id);
			expect(afterFailure.status).toBe("verified");
			expect(afterFailure.processingQueuedAt).toBeNull();

			const retried = await replayAcknowledgedUpload({
				dbClient: db,
				upload: afterFailure,
				queueProcessing,
			});
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
			const again = await replayAcknowledgedUpload({
				dbClient: db,
				upload: await readUpload(db, upload.id),
				queueProcessing,
			});
			expect(again?.processing).toEqual({ status: "queued" });
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
			const { sent, queueProcessing } = recordingInngest(0);

			await acknowledgePresignedUpload({
				dbClient: db,
				s3Client: storage,
				upload,
				queueProcessing,
			});
			const verified = await readUpload(db, upload.id);
			expect(verified.processingQueuedAt).toBeInstanceOf(Date);

			await replayAcknowledgedUpload({
				dbClient: db,
				upload: verified,
				queueProcessing,
			});
			expect(sent).toHaveLength(1);
		});
	});

	test("replay finds nothing for an upload that was never acknowledged", async () => {
		await withRollback(async (db) => {
			const upload = await seedIssuedUpload(db);
			expect(
				await replayAcknowledgedUpload({
					dbClient: db,
					upload: await readUpload(db, upload.id),
					queueProcessing: {
						enabled: false,
						code: "workflow_unavailable",
					},
				}),
			).toBeUndefined();
		});
	});
});
