import { schema } from "@arcnem-vision/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
	acknowledgePresignedUpload,
	isDocumentVisibility,
	parseAckRequestBody,
	readJSONBody,
	toDocumentUploadErrorResponse,
} from "@/lib/document-uploads";
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
			const [uploadForKey] = await dbClient
				.select({
					id: presignedUploads.id,
					bucket: presignedUploads.bucket,
					objectKey: presignedUploads.objectKey,
					organizationId: presignedUploads.organizationId,
					projectId: presignedUploads.projectId,
					apiKeyId: presignedUploads.apiKeyId,
					visibility: presignedUploads.visibility,
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
						eq(presignedUploads.status, "issued"),
					),
				)
				.limit(1);

			if (!uploadForKey) {
				return c.json(
					{ message: "Upload objectKey is not valid for this API key" },
					404,
				);
			}

			if (!isDocumentVisibility(uploadForKey.visibility)) {
				return c.json({ message: "Upload has invalid visibility" }, 500);
			}

			return c.json(
				await acknowledgePresignedUpload({
					dbClient,
					s3Client,
					upload: {
						...uploadForKey,
						visibility: uploadForKey.visibility,
					},
					queueProcessing: {
						enabled: true,
						inngestClient,
						agentGraphId: verifiedKey.agentGraphId ?? undefined,
					},
				}),
			);
		} catch (error) {
			return toDocumentUploadErrorResponse(
				c,
				error,
				"Failed to acknowledge upload",
			);
		}
	},
);
