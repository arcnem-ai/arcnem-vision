import { schema } from "@arcnem-vision/db";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { QueueProcessingWithResult } from "@/lib/document-uploads";
import {
	acknowledgePresignedUpload,
	isDocumentVisibility,
	parseAckRequestBody,
	readJSONBody,
	replayAcknowledgedUpload,
	toDocumentUploadErrorResponse,
} from "@/lib/document-uploads";
import { findActiveWorkflowById } from "@/lib/workflow-run-availability";
import {
	requireAPIKey,
	requireAPIKeyPermission,
	requireWorkflowAPIKey,
} from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";

const { apikeys, presignedUploads } = schema;

export const ackUploadRouter = new Hono<HonoServerContext>({
	strict: false,
});

ackUploadRouter.post(
	"/uploads/ack",
	requireAPIKey,
	requireWorkflowAPIKey,
	requireAPIKeyPermission("uploads", "ack"),
	async (c) => {
		try {
			const verifiedKey = c.get("apiKey");
			if (!verifiedKey) throw new Error("Expected API key");

			const dbClient = c.get("dbClient");
			const s3Client = c.get("s3Client");
			const inngestClient = c.get("inngestClient");
			const body = await readJSONBody(c.req);
			const { objectKey } = parseAckRequestBody(body);
			console.info("Acknowledging uploaded object", {
				apiKeyId: verifiedKey.id,
				objectKey,
			});
			const [uploadForKey] = await dbClient
				.select({
					id: presignedUploads.id,
					bucket: presignedUploads.bucket,
					objectKey: presignedUploads.objectKey,
					organizationId: presignedUploads.organizationId,
					projectId: presignedUploads.projectId,
					apiKeyId: presignedUploads.apiKeyId,
					visibility: presignedUploads.visibility,
					status: presignedUploads.status,
					processingQueuedAt: presignedUploads.processingQueuedAt,
				})
				.from(presignedUploads)
				.innerJoin(
					apikeys,
					and(
						eq(apikeys.organizationId, presignedUploads.organizationId),
						eq(apikeys.projectId, presignedUploads.projectId),
						eq(apikeys.id, presignedUploads.apiKeyId),
					),
				)
				.where(
					and(
						eq(apikeys.id, verifiedKey.id),
						eq(presignedUploads.objectKey, objectKey),
						inArray(presignedUploads.status, ["issued", "verified"]),
					),
				)
				.limit(1);

			if (!uploadForKey) {
				console.warn("Upload ack rejected unknown or stale object key", {
					apiKeyId: verifiedKey.id,
					objectKey,
				});
				return c.json(
					{ message: "Upload objectKey is not valid for this API key" },
					404,
				);
			}

			if (!isDocumentVisibility(uploadForKey.visibility)) {
				console.error("Upload ack found invalid persisted visibility", {
					apiKeyId: verifiedKey.id,
					objectKey,
					visibility: uploadForKey.visibility,
				});
				return c.json({ message: "Upload has invalid visibility" }, 500);
			}

			const activeWorkflow = verifiedKey.agentGraphId
				? await findActiveWorkflowById(
						dbClient,
						verifiedKey.organizationId,
						verifiedKey.agentGraphId,
					)
				: null;
			const queueProcessing: QueueProcessingWithResult = activeWorkflow
				? {
						enabled: true,
						inngestClient,
						agentGraphId: activeWorkflow.id,
					}
				: {
						enabled: false,
						code: "workflow_unavailable",
					};

			const upload = {
				...uploadForKey,
				visibility: uploadForKey.visibility,
			};
			// A verified upload is acknowledged again to retry its processing, for
			// example after the first acknowledgement reported
			// processing_enqueue_failed. The event ID is stable per document.
			if (uploadForKey.status === "verified") {
				const replayed = await replayAcknowledgedUpload({
					dbClient,
					upload,
					queueProcessing,
				});
				if (!replayed) {
					throw new Error("Verified upload is missing its document");
				}
				return c.json(replayed);
			}

			try {
				return c.json(
					await acknowledgePresignedUpload({
						dbClient,
						s3Client,
						upload,
						queueProcessing,
					}),
				);
			} catch (error) {
				// A concurrent acknowledgement may have verified the upload first.
				const replayed = await replayAcknowledgedUpload({
					dbClient,
					upload,
					queueProcessing,
				});
				if (!replayed) throw error;
				return c.json(replayed);
			}
		} catch (error) {
			return toDocumentUploadErrorResponse(
				c,
				error,
				"Failed to acknowledge upload",
			);
		}
	},
);
