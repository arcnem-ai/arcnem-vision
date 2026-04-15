import type { S3Client } from "bun";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";

export const PRESIGN_GET_EXPIRES_IN_SECONDS = 60 * 5;

export type APIDocumentRow = {
	id: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number | string;
	createdAt: Date | string;
	description: string | null;
	visibility: string;
	deviceId?: string | null;
	distance?: number | string | null;
};

function buildPublicDocumentURL(objectKey: string) {
	const publicBaseURL = getAPIEnvVar(API_ENV_VAR.S3_PUBLIC_BASE_URL).trim();
	return new URL(objectKey, `${publicBaseURL}/`).toString();
}

export function toAPIDocumentItem(row: APIDocumentRow, s3Client: S3Client) {
	const downloadUrl = s3Client.presign(row.objectKey, {
		method: "GET",
		expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
	});

	return {
		id: row.id,
		objectKey: row.objectKey,
		contentType: row.contentType,
		sizeBytes: Number(row.sizeBytes),
		createdAt:
			row.createdAt instanceof Date
				? row.createdAt.toISOString()
				: row.createdAt,
		description: row.description,
		visibility:
			row.visibility === "private" || row.visibility === "public"
				? row.visibility
				: "org",
		deviceId: row.deviceId ?? null,
		distance: row.distance == null ? null : Number(row.distance),
		downloadUrl,
		thumbnailUrl: downloadUrl,
		publicUrl:
			row.visibility === "public"
				? buildPublicDocumentURL(row.objectKey)
				: null,
	};
}
