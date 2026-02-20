import { schema } from "@arcnem-vision/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getS3Client } from "@/clients/s3";
import {
	ALLOWED_IMAGE_MIME_TYPES,
	MAX_UPLOAD_SIZE_BYTES,
	MIME_TYPE_TO_EXTENSION,
	PRESIGN_EXPIRES_IN_SECONDS,
} from "@/constants/uploads";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { requireAPIKey } from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";

const s3Client = getS3Client();
const S3_BUCKET = getAPIEnvVar("S3_BUCKET");
const { apikeys, devices, organizations, presignedUploads, projects } = schema;

export const uploadRouter = new Hono<HonoServerContext>({
	strict: false,
});

uploadRouter.post("/uploads/presign", requireAPIKey, async (c) => {
	const verifiedKey = c.get("apiKey");
	if (!verifiedKey) throw new Error("Expected API key");

	const dbClient = c.get("dbClient");
	const [uploadTarget] = await dbClient
		.select({
			organizationSlug: organizations.slug,
			projectSlug: projects.slug,
			deviceSlug: devices.slug,
			deviceId: devices.id,
		})
		.from(apikeys)
		.innerJoin(organizations, eq(apikeys.organizationId, organizations.id))
		.innerJoin(
			projects,
			and(
				eq(apikeys.projectId, projects.id),
				eq(projects.organizationId, organizations.id),
			),
		)
		.innerJoin(
			devices,
			and(
				eq(apikeys.deviceId, devices.id),
				eq(devices.projectId, projects.id),
				eq(devices.organizationId, organizations.id),
			),
		)
		.where(eq(apikeys.id, verifiedKey.id))
		.limit(1);

	if (!uploadTarget) {
		return c.json({ message: "Invalid API key context" }, 401);
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ message: "Invalid JSON request body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ message: "Request body is required" }, 400);
	}

	const { contentType, size } = body as {
		contentType?: unknown;
		size?: unknown;
	};

	if (typeof contentType !== "string" || contentType.length === 0) {
		return c.json({ message: "contentType is required" }, 400);
	}

	const normalizedContentType = contentType.toLowerCase();
	if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedContentType)) {
		return c.json({ message: "Only image uploads are allowed" }, 400);
	}

	const parsedSize = typeof size === "number" ? size : Number.NaN;
	if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
		return c.json({ message: "size must be a positive integer" }, 400);
	}

	if (parsedSize > MAX_UPLOAD_SIZE_BYTES) {
		return c.json(
			{
				message: `File exceeds maximum upload size of ${MAX_UPLOAD_SIZE_BYTES} bytes`,
				maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
			},
			413,
		);
	}

	const extension = MIME_TYPE_TO_EXTENSION[normalizedContentType] ?? "img";
	const dateFolder = new Date().toISOString().slice(0, 10);
	const objectKey = `uploads/${uploadTarget.organizationSlug}/${uploadTarget.projectSlug}/${uploadTarget.deviceSlug}/${dateFolder}/${crypto.randomUUID()}.${extension}`;
	const uploadUrl = s3Client.presign(objectKey, {
		method: "PUT",
		expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
	});
	const [presignedUpload] = await dbClient
		.insert(presignedUploads)
		.values({
			bucket: S3_BUCKET,
			objectKey,
			deviceId: uploadTarget.deviceId,
			status: "issued",
		})
		.returning({
			id: presignedUploads.id,
		});

	if (!presignedUpload) {
		return c.json({ message: "Failed to create presigned upload record" }, 500);
	}

	return c.json({
		presignedUploadId: presignedUpload.id,
		objectKey,
		uploadUrl,
		contentType: normalizedContentType,
		maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
		expiresInSeconds: PRESIGN_EXPIRES_IN_SECONDS,
	});
});
