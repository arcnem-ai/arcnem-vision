import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	createDashboardRealtimeEvent,
	DASHBOARD_REALTIME_REASON,
} from "@arcnem-vision/shared";
import type { S3Client } from "bun";
import { and, eq } from "drizzle-orm";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/constants/uploads";
import { publishDashboardRealtimeEvent } from "@/lib/dashboard-realtime";
import type {
	AcknowledgedUpload,
	AcknowledgedUploadWithProcessing,
	PendingUpload,
	QueueProcessingOptions,
	QueueProcessingWithoutResult,
	QueueProcessingWithResult,
	VerifiedUploadObject,
	WorkflowUploadProcessing,
} from "./acknowledge.types";
import { fail } from "./errors";

const { documents, presignedUploads } = schema;

const statUploadedObject = async ({
	s3Client,
	objectKey,
}: {
	s3Client: S3Client;
	objectKey: string;
}): Promise<VerifiedUploadObject> => {
	const objectStats = (await s3Client
		.stat(objectKey)
		.catch(() => fail(404, "Uploaded object not found in storage"))) as {
		size: number;
		lastModified: Date;
		etag: string;
		type: string;
	};

	const normalizedContentType = objectStats.type.trim().toLowerCase();
	if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedContentType)) {
		fail(400, "Uploaded object is not a supported image type");
	}

	if (!Number.isInteger(objectStats.size) || objectStats.size <= 0) {
		fail(409, "Uploaded object has invalid size");
	}

	if (!objectStats.etag || objectStats.etag.trim().length === 0) {
		fail(409, "Uploaded object is missing ETag metadata");
	}

	if (Number.isNaN(objectStats.lastModified.getTime())) {
		fail(409, "Uploaded object has invalid lastModified metadata");
	}

	return {
		contentType: normalizedContentType,
		size: objectStats.size,
		eTag: objectStats.etag,
		lastModifiedAt: objectStats.lastModified,
	};
};

const createDocumentAndVerifyUpload = async ({
	dbClient,
	upload,
	verifiedObject,
}: {
	dbClient: PGDB;
	upload: PendingUpload;
	verifiedObject: VerifiedUploadObject;
}): Promise<{ documentId: string; presignedUploadId: string }> => {
	try {
		const acknowledgedUpload = await dbClient.transaction(async (tx) => {
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
				.returning({
					id: documents.id,
				});

			if (!createdDocument) {
				throw new Error("Failed to create document");
			}

			const [verifiedUpload] = await tx
				.update(presignedUploads)
				.set({ status: "verified" })
				.where(
					and(
						eq(presignedUploads.id, upload.id),
						eq(presignedUploads.status, "issued"),
					),
				)
				.returning({
					id: presignedUploads.id,
				});

			if (!verifiedUpload) {
				throw new Error("Presigned upload is not in an issued state");
			}

			return {
				documentId: createdDocument.id,
				presignedUploadId: verifiedUpload.id,
			};
		});

		return acknowledgedUpload;
	} catch {
		return fail(409, "Failed to acknowledge upload");
	}
};

const publishDocumentCreated = async ({
	organizationId,
	documentId,
}: {
	organizationId: string;
	documentId: string;
}) => {
	await publishDashboardRealtimeEvent(
		createDashboardRealtimeEvent({
			reason: DASHBOARD_REALTIME_REASON.documentCreated,
			organizationId,
			documentId,
		}),
	);
};

const enqueueDocumentProcessing = async ({
	options,
	documentId,
	objectKey,
}: {
	options: QueueProcessingOptions;
	documentId: string;
	objectKey: string;
}): Promise<WorkflowUploadProcessing | null> => {
	if (!options.enabled) {
		return options.code
			? {
					status: "skipped" as const,
					code: options.code,
				}
			: null;
	}

	try {
		await options.inngestClient.send({
			name: "document/process.upload",
			data: {
				document_id: documentId,
				...(options.agentGraphId
					? { agent_graph_id: options.agentGraphId }
					: {}),
			},
		});

		return {
			status: "queued" as const,
		};
	} catch (error) {
		console.error("Failed to enqueue document processing", {
			documentId,
			objectKey,
			error,
		});

		return {
			status: "failed" as const,
			code: "processing_enqueue_failed" as const,
		};
	}
};

export function acknowledgePresignedUpload(args: {
	dbClient: PGDB;
	s3Client: S3Client;
	upload: PendingUpload;
	queueProcessing: QueueProcessingWithoutResult;
}): Promise<AcknowledgedUpload>;
export function acknowledgePresignedUpload(args: {
	dbClient: PGDB;
	s3Client: S3Client;
	upload: PendingUpload;
	queueProcessing: QueueProcessingWithResult;
}): Promise<AcknowledgedUploadWithProcessing>;
export async function acknowledgePresignedUpload({
	dbClient,
	s3Client,
	upload,
	queueProcessing,
}: {
	dbClient: PGDB;
	s3Client: S3Client;
	upload: PendingUpload;
	queueProcessing: QueueProcessingOptions;
}): Promise<AcknowledgedUpload | AcknowledgedUploadWithProcessing> {
	const verifiedObject = await statUploadedObject({
		s3Client,
		objectKey: upload.objectKey,
	});
	const acknowledgedUpload = await createDocumentAndVerifyUpload({
		dbClient,
		upload,
		verifiedObject,
	});

	await publishDocumentCreated({
		organizationId: upload.organizationId,
		documentId: acknowledgedUpload.documentId,
	});

	const processing = await enqueueDocumentProcessing({
		options: queueProcessing,
		documentId: acknowledgedUpload.documentId,
		objectKey: upload.objectKey,
	});

	return {
		status: "verified",
		documentId: acknowledgedUpload.documentId,
		presignedUploadId: acknowledgedUpload.presignedUploadId,
		...(processing ? { processing } : {}),
	};
}
