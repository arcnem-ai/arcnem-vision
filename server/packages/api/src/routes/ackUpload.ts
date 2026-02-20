import { schema } from "@arcnem-vision/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/constants/uploads";
import { requireAPIKey } from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";

const { apikeys, documents, presignedUploads } = schema;

export const ackUploadRouter = new Hono<HonoServerContext>({
	strict: false,
});

ackUploadRouter.post("/uploads/ack", requireAPIKey, async (c) => {
	const verifiedKey = c.get("apiKey");
	if (!verifiedKey) throw new Error("Expected API key");

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ message: "Invalid JSON request body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ message: "Request body is required" }, 400);
	}

	const { key, objectKey: objectKeyFromBody } = body as {
		key?: unknown;
		objectKey?: unknown;
	};

	const objectKeyCandidate =
		typeof key === "string"
			? key
			: typeof objectKeyFromBody === "string"
				? objectKeyFromBody
				: null;
	const objectKey = objectKeyCandidate?.trim() ?? "";
	if (objectKey.length === 0) {
		return c.json({ message: "key (or objectKey) is required" }, 400);
	}

	const dbClient = c.get("dbClient");
	const s3Client = c.get("s3Client");
	const inngestClient = c.get("inngestClient");

	const [uploadForKey] = await dbClient
		.select({
			id: presignedUploads.id,
			bucket: presignedUploads.bucket,
			objectKey: presignedUploads.objectKey,
			organizationId: apikeys.organizationId,
			projectId: apikeys.projectId,
			deviceId: apikeys.deviceId,
		})
		.from(apikeys)
		.innerJoin(
			presignedUploads,
			and(
				eq(presignedUploads.objectKey, objectKey),
				eq(presignedUploads.deviceId, apikeys.deviceId),
			),
		)
		.where(
			and(
				eq(apikeys.id, verifiedKey.id),
				eq(presignedUploads.status, "issued"),
			),
		)
		.limit(1);

	if (!uploadForKey) {
		return c.json({ message: "Upload key is not valid for this API key" }, 404);
	}

	let objectStats: {
		size: number;
		lastModified: Date;
		etag: string;
		type: string;
	};
	try {
		objectStats = await s3Client.stat(uploadForKey.objectKey);
	} catch {
		return c.json({ message: "Uploaded object not found in storage" }, 404);
	}

	const normalizedContentType = objectStats.type.toLowerCase();
	if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedContentType)) {
		return c.json(
			{ message: "Uploaded object is not a supported image type" },
			400,
		);
	}

	if (!Number.isInteger(objectStats.size) || objectStats.size <= 0) {
		return c.json({ message: "Uploaded object has invalid size" }, 409);
	}

	if (!objectStats.etag || objectStats.etag.length === 0) {
		return c.json({ message: "Uploaded object is missing ETag metadata" }, 409);
	}

	if (Number.isNaN(objectStats.lastModified.getTime())) {
		return c.json(
			{ message: "Uploaded object has invalid lastModified metadata" },
			409,
		);
	}

	let result: { documentId: string; presignedUploadId: string };
	try {
		result = await dbClient.transaction(async (tx) => {
			const [createdDocument] = await tx
				.insert(documents)
				.values({
					bucket: uploadForKey.bucket,
					objectKey: uploadForKey.objectKey,
					contentType: normalizedContentType,
					eTag: objectStats.etag,
					sizeBytes: objectStats.size,
					visibility: "org",
					lastModifiedAt: objectStats.lastModified,
					organizationId: uploadForKey.organizationId,
					projectId: uploadForKey.projectId,
					deviceId: uploadForKey.deviceId,
				})
				.returning({
					id: documents.id,
				});

			if (!createdDocument) {
				throw new Error("Failed to create document");
			}

			const [updatedPresignedUpload] = await tx
				.update(presignedUploads)
				.set({ status: "verified" })
				.where(
					and(
						eq(presignedUploads.id, uploadForKey.id),
						eq(presignedUploads.status, "issued"),
					),
				)
				.returning({
					id: presignedUploads.id,
				});

			if (!updatedPresignedUpload) {
				throw new Error("Presigned upload is not in an issued state");
			}

			return {
				documentId: createdDocument.id,
				presignedUploadId: updatedPresignedUpload.id,
			};
		});
	} catch {
		return c.json({ message: "Failed to acknowledge upload" }, 409);
	}

	try {
		await inngestClient.send({
			name: "document/process.upload",
			data: { document_id: result.documentId },
		});
	} catch {
		return c.json(
			{
				message: "Upload verified but failed to enqueue image processing",
				documentId: result.documentId,
				presignedUploadId: result.presignedUploadId,
			},
			502,
		);
	}

	return c.json({
		status: "verified",
		documentId: result.documentId,
		presignedUploadId: result.presignedUploadId,
	});
});
