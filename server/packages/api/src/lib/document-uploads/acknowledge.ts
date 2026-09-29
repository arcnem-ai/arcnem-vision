import { schema } from "@arcnem-vision/db";
import {
	createDashboardRealtimeEvent,
	DASHBOARD_REALTIME_REASON,
} from "@arcnem-vision/shared";
import { and, eq } from "drizzle-orm";
import { Data, Effect } from "effect";
import {
	ALLOWED_IMAGE_MIME_TYPES,
	MAX_UPLOAD_SIZE_BYTES,
} from "@/constants/uploads";
import { publishDashboardRealtimeEvent } from "@/lib/dashboard-realtime";
import type {
	AcknowledgedUpload,
	AcknowledgedUploadWithProcessing,
	PendingUpload,
	QueueProcessing,
	VerifiedUploadObject,
	WorkflowQueueProcessing,
	WorkflowUploadProcessing,
} from "./acknowledge.types";
import {
	DatabaseFailed,
	queryDatabase,
	UploadDatabase,
	UploadEvents,
	UploadStorage,
} from "./services";

const { documents, presignedUploads } = schema;

// The stored object cannot become a document. Its status and message are what
// the client receives.
export class UploadRejected extends Data.TaggedError("UploadRejected")<{
	status: 400 | 409 | 413;
	message: string;
	maxSizeBytes?: number;
}> {}

// Another acknowledgement verified this upload first. The caller replays that
// acknowledgement instead of failing.
export class UploadAlreadyAcknowledged extends Data.TaggedError(
	"UploadAlreadyAcknowledged",
)<{ uploadId: string }> {}

// Thrown inside the transaction so it rolls back, then reported as
// UploadAlreadyAcknowledged.
class UploadNoLongerIssued extends Error {}

// A document already exists for this object, so another acknowledgement
// committed first. Drizzle may wrap the driver error, so check its cause too.
function isDuplicateDocument(error: unknown): boolean {
	for (let current = error; current; ) {
		const candidate = current as { code?: string; constraint?: string };
		if (
			candidate.code === "23505" &&
			candidate.constraint === "documents_bucket_object_key_uidx"
		)
			return true;
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

// Checks the stored object itself: presign only saw the size the client
// declared, and a presigned PUT does not enforce it.
export const statUploadedObject = Effect.fn("statUploadedObject")(function* (
	objectKey: string,
) {
	const storage = yield* UploadStorage;
	const stats = yield* storage.stat(objectKey);

	if (!Number.isInteger(stats.size) || stats.size <= 0) {
		return yield* new UploadRejected({
			status: 409,
			message: "Uploaded object has invalid size",
		});
	}

	// Checked before the content type, so an oversized object is always deleted.
	if (stats.size > MAX_UPLOAD_SIZE_BYTES) {
		// The object can never become a document, so don't keep it in storage.
		yield* storage.delete(objectKey).pipe(
			Effect.catch((error) =>
				Effect.sync(() =>
					console.error("Failed to delete oversized upload", {
						objectKey,
						error: error.cause,
					}),
				),
			),
		);
		return yield* new UploadRejected({
			status: 413,
			message: `Uploaded object exceeds maximum upload size of ${MAX_UPLOAD_SIZE_BYTES} bytes`,
			maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
		});
	}

	const contentType = stats.type.trim().toLowerCase();
	if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType)) {
		return yield* new UploadRejected({
			status: 400,
			message: "Uploaded object is not a supported image type",
		});
	}
	if (!stats.etag || stats.etag.trim().length === 0) {
		return yield* new UploadRejected({
			status: 409,
			message: "Uploaded object is missing ETag metadata",
		});
	}
	if (Number.isNaN(stats.lastModified.getTime())) {
		return yield* new UploadRejected({
			status: 409,
			message: "Uploaded object has invalid lastModified metadata",
		});
	}

	return {
		contentType,
		size: stats.size,
		eTag: stats.etag,
		lastModifiedAt: stats.lastModified,
	} satisfies VerifiedUploadObject;
});

const createDocumentAndVerifyUpload = Effect.fn(
	"createDocumentAndVerifyUpload",
)(function* (upload: PendingUpload, verifiedObject: VerifiedUploadObject) {
	const db = yield* UploadDatabase;
	return yield* Effect.tryPromise({
		try: () =>
			db.transaction(async (tx) => {
				const [createdDocument] = await tx
					.insert(documents)
					.values({
						bucket: upload.bucket,
						objectKey: upload.objectKey,
						contentType: verifiedObject.contentType,
						eTag: verifiedObject.eTag,
						sizeBytes: verifiedObject.size,
						visibility: upload.visibility,
						lastModifiedAt: verifiedObject.lastModifiedAt,
						organizationId: upload.organizationId,
						projectId: upload.projectId,
						apiKeyId: upload.apiKeyId,
					})
					.returning({ id: documents.id });
				if (!createdDocument) throw new Error("Failed to create document");

				const [verifiedUpload] = await tx
					.update(presignedUploads)
					.set({ status: "verified" })
					.where(
						and(
							eq(presignedUploads.id, upload.id),
							eq(presignedUploads.status, "issued"),
						),
					)
					.returning({ id: presignedUploads.id });
				if (!verifiedUpload) throw new UploadNoLongerIssued();

				return {
					documentId: createdDocument.id,
					presignedUploadId: verifiedUpload.id,
				};
			}),
		catch: (cause) => cause,
	}).pipe(
		Effect.mapError((cause) =>
			cause instanceof UploadNoLongerIssued || isDuplicateDocument(cause)
				? new UploadAlreadyAcknowledged({ uploadId: upload.id })
				: new DatabaseFailed({
						operation: "create document and verify upload",
						cause,
					}),
		),
	);
});

const enqueueDocumentProcessing = Effect.fn("enqueueDocumentProcessing")(
	function* (
		queueProcessing: QueueProcessing,
		upload: { id: string; objectKey: string },
		documentId: string,
	) {
		if (!queueProcessing.enabled) {
			return queueProcessing.code
				? ({ status: "skipped", code: queueProcessing.code } as const)
				: null;
		}

		const events = yield* UploadEvents;
		// One stable ID per document, so a repeated acknowledgement can retry a
		// failed enqueue without queueing the upload twice.
		const enqueued = yield* events
			.send({
				id: `document-process-upload-${documentId}`,
				name: "document/process.upload",
				data: {
					document_id: documentId,
					...(queueProcessing.agentGraphId
						? { agent_graph_id: queueProcessing.agentGraphId }
						: {}),
				},
			})
			.pipe(
				Effect.as(true),
				Effect.catch((error) =>
					Effect.sync(() => {
						console.error("Failed to enqueue document processing", {
							documentId,
							objectKey: upload.objectKey,
							error: error.cause,
						});
						return false;
					}),
				),
			);
		if (!enqueued) {
			return {
				status: "failed",
				code: "processing_enqueue_failed",
			} as const satisfies WorkflowUploadProcessing;
		}

		// If this write fails the acknowledgement fails too, so the client retries
		// while Inngest's deduplication of the stable event ID still applies.
		yield* queryDatabase("record queued processing", (db) =>
			db
				.update(presignedUploads)
				.set({ processingQueuedAt: new Date() })
				.where(eq(presignedUploads.id, upload.id)),
		);
		return { status: "queued" } as const satisfies WorkflowUploadProcessing;
	},
);

// The document created by an earlier acknowledgement of this upload.
export const findAcknowledgedUpload = Effect.fn("findAcknowledgedUpload")(
	function* (upload: Omit<PendingUpload, "visibility">) {
		const apiKeyId = upload.apiKeyId;
		if (!apiKeyId) return undefined;

		const [document] = yield* queryDatabase("find acknowledged upload", (db) =>
			db
				.select({ id: documents.id })
				.from(documents)
				.where(
					and(
						eq(documents.bucket, upload.bucket),
						eq(documents.objectKey, upload.objectKey),
						eq(documents.organizationId, upload.organizationId),
						eq(documents.projectId, upload.projectId),
						eq(documents.apiKeyId, apiKeyId),
					),
				)
				.limit(1),
		);
		return document
			? ({
					status: "verified",
					documentId: document.id,
					presignedUploadId: upload.id,
				} satisfies AcknowledgedUpload)
			: undefined;
	},
);

// Repeats the processing step for an upload that was already acknowledged,
// such as after the first acknowledgement failed to enqueue it.
export const replayAcknowledgedUpload = Effect.fn("replayAcknowledgedUpload")(
	function* (
		upload: PendingUpload & { processingQueuedAt: Date | null },
		queueProcessing: QueueProcessing,
	) {
		const acknowledged = yield* findAcknowledgedUpload(upload);
		if (!acknowledged) return undefined;

		// Inngest only deduplicates event IDs for 24 hours, so an upload whose
		// processing was queued is never sent again.
		if (upload.processingQueuedAt) {
			return { ...acknowledged, processing: { status: "queued" } } as const;
		}
		const processing = yield* enqueueDocumentProcessing(
			queueProcessing,
			upload,
			acknowledged.documentId,
		);
		return processing ? { ...acknowledged, processing } : acknowledged;
	},
);

// Turns a verified upload into a document and queues its processing.
export const acknowledgePresignedUpload = Effect.fn(
	"acknowledgePresignedUpload",
)(function* (upload: PendingUpload, queueProcessing: QueueProcessing) {
	const verifiedObject = yield* statUploadedObject(upload.objectKey);
	const acknowledged = yield* createDocumentAndVerifyUpload(
		upload,
		verifiedObject,
	);

	yield* Effect.promise(() =>
		publishDashboardRealtimeEvent(
			createDashboardRealtimeEvent({
				reason: DASHBOARD_REALTIME_REASON.documentCreated,
				organizationId: upload.organizationId,
				documentId: acknowledged.documentId,
			}),
		),
	);

	const processing = yield* enqueueDocumentProcessing(
		queueProcessing,
		upload,
		acknowledged.documentId,
	);
	return {
		status: "verified",
		documentId: acknowledged.documentId,
		presignedUploadId: acknowledged.presignedUploadId,
		...(processing ? { processing } : {}),
	} as AcknowledgedUpload & { processing?: WorkflowUploadProcessing };
});

const missingDocument = Effect.die(
	new Error("Verified upload is missing its document"),
);

// Workflow-key acknowledgement. A verified upload is acknowledged again to
// retry its processing, for example after the first acknowledgement reported
// processing_enqueue_failed; the event ID is stable per document.
export const acknowledgeWorkflowUpload = Effect.fn("acknowledgeWorkflowUpload")(
	function* (
		upload: PendingUpload & {
			status: string;
			processingQueuedAt: Date | null;
		},
		queueProcessing: WorkflowQueueProcessing,
	) {
		const replay = replayAcknowledgedUpload(upload, queueProcessing).pipe(
			Effect.flatMap((replayed) =>
				replayed ? Effect.succeed(replayed) : missingDocument,
			),
		);
		if (upload.status === "verified") {
			return (yield* replay) as AcknowledgedUploadWithProcessing;
		}
		return (yield* acknowledgePresignedUpload(upload, queueProcessing).pipe(
			Effect.catchTag("UploadAlreadyAcknowledged", () => replay),
		)) as AcknowledgedUploadWithProcessing;
	},
);

// Service-key acknowledgement. It never queues processing; the caller runs
// workflows explicitly.
export const acknowledgeServiceUpload = Effect.fn("acknowledgeServiceUpload")(
	function* (upload: PendingUpload & { status: string }) {
		const existing = yield* findAcknowledgedUpload(upload);
		if (existing) return existing;
		if (upload.status !== "issued") return yield* missingDocument;

		return yield* acknowledgePresignedUpload(upload, { enabled: false }).pipe(
			Effect.map(
				({ status, documentId, presignedUploadId }): AcknowledgedUpload => ({
					status,
					documentId,
					presignedUploadId,
				}),
			),
			Effect.catchTag("UploadAlreadyAcknowledged", () =>
				findAcknowledgedUpload(upload).pipe(
					Effect.flatMap((found) =>
						found ? Effect.succeed(found) : missingDocument,
					),
				),
			),
		);
	},
);

// Dashboard acknowledgement. Dashboard uploads are acknowledged once and never
// replayed, so a concurrent second acknowledgement is a conflict.
export const acknowledgeDashboardUpload = (upload: PendingUpload) =>
	acknowledgePresignedUpload(upload, { enabled: false }).pipe(
		Effect.catchTag("UploadAlreadyAcknowledged", () =>
			Effect.fail(
				new UploadRejected({
					status: 409,
					message: "Upload was already acknowledged",
				}),
			),
		),
	);
