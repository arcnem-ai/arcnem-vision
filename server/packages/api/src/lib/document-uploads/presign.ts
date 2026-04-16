import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import type { S3Client } from "bun";
import {
	MAX_UPLOAD_SIZE_BYTES,
	MIME_TYPE_TO_EXTENSION,
	PRESIGN_EXPIRES_IN_SECONDS,
} from "@/constants/uploads";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { fail } from "./errors";
import type { UploadTarget } from "./presign.types";

const S3_BUCKET = getAPIEnvVar("S3_BUCKET");
const { presignedUploads } = schema;

const buildObjectKey = (
	target: UploadTarget,
	contentType: string,
	dateFolder = new Date().toISOString().slice(0, 10),
) => {
	const extension = MIME_TYPE_TO_EXTENSION[contentType] ?? "img";

	return `uploads/${target.organizationSlug}/${target.projectSlug}/${target.objectKeySource}/${dateFolder}/${crypto.randomUUID()}.${extension}`;
};

export const issuePresignedUpload = async ({
	dbClient,
	s3Client,
	target,
	contentType,
	documentVisibility,
}: {
	dbClient: PGDB;
	s3Client: S3Client;
	target: UploadTarget;
	contentType: string;
	documentVisibility: "private" | "org" | "public";
}) => {
	const objectKey = buildObjectKey(target, contentType);
	const uploadUrl = s3Client.presign(objectKey, {
		method: "PUT",
		expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
	});

	const [presignedUpload] = await dbClient
		.insert(presignedUploads)
		.values({
			bucket: S3_BUCKET,
			objectKey,
			organizationId: target.organizationId,
			projectId: target.projectId,
			apiKeyId: target.apiKeyId,
			visibility: documentVisibility,
			status: "issued",
		})
		.returning({
			id: presignedUploads.id,
		});

	if (!presignedUpload) {
		fail(500, "Failed to create presigned upload record");
	}

	return {
		presignedUploadId: presignedUpload.id,
		objectKey,
		uploadUrl,
		contentType,
		maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
		expiresInSeconds: PRESIGN_EXPIRES_IN_SECONDS,
	};
};
