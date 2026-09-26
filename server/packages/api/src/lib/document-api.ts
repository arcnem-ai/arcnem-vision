import type { PGDB } from "@arcnem-vision/db/server";
import type { S3Client } from "bun";
import { sql } from "drizzle-orm";
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
	apiKeyId?: string | null;
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
		apiKeyId: row.apiKeyId ?? null,
		distance: row.distance == null ? null : Number(row.distance),
		downloadUrl,
		thumbnailUrl: downloadUrl,
		publicUrl:
			row.visibility === "public"
				? buildPublicDocumentURL(row.objectKey)
				: null,
	};
}

// Similar documents are limited to the workflow key's own documents, the same
// scope as the list and read routes. Embeddings only compare within one model,
// and each document appears once, at its closest distance.
export async function findSimilarKeyDocuments(
	db: PGDB,
	input: { documentId: string; apiKeyId: string; limit: number },
): Promise<APIDocumentRow[]> {
	const result = await db.execute<APIDocumentRow>(sql`
		SELECT
			d.id,
			d.object_key AS "objectKey",
			d.content_type AS "contentType",
			d.size_bytes AS "sizeBytes",
			d.created_at AS "createdAt",
			dd_latest.text AS description,
			d.visibility,
			d.api_key_id AS "apiKeyId",
			best.distance
		FROM (
			SELECT
				target_description.document_id,
				MIN(target.embedding <=> source.embedding) AS distance
			FROM document_description_embeddings source
			JOIN document_descriptions source_description
				ON source_description.id = source.document_description_id
			JOIN document_description_embeddings target
				ON target.model_id = source.model_id
				AND target.embedding_dim = source.embedding_dim
			JOIN document_descriptions target_description
				ON target_description.id = target.document_description_id
			JOIN documents target_document
				ON target_document.id = target_description.document_id
			WHERE source_description.document_id = ${input.documentId}
				AND target_document.api_key_id = ${input.apiKeyId}
				AND target_document.id != ${input.documentId}
			GROUP BY target_description.document_id
		) best
		JOIN documents d ON d.id = best.document_id
		LEFT JOIN LATERAL (
			SELECT dd.text
			FROM document_descriptions dd
			WHERE dd.document_id = d.id
			ORDER BY dd.created_at DESC
			LIMIT 1
		) dd_latest ON TRUE
		ORDER BY best.distance ASC, d.id ASC
		LIMIT ${input.limit}
	`);
	return result.rows;
}
