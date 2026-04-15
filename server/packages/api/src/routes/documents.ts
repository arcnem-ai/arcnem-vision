import { schema } from "@arcnem-vision/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { Hono, type Context as HonoContext } from "hono";
import { type APIDocumentRow, toAPIDocumentItem } from "@/lib/document-api";
import {
	requireAPIKey,
	requireAPIKeyPermission,
} from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";

const { apikeys, documents, documentDescriptions } = schema;

export const documentsRouter = new Hono<HonoServerContext>({
	strict: false,
});

type DocumentAPIKeyContext = {
	deviceId: string | null;
	organizationId: string;
};

function requireVerifiedAPIKeyId(c: HonoContext<HonoServerContext>) {
	const verifiedKey = c.get("apiKey");
	if (!verifiedKey) {
		throw new Error("Expected API key");
	}

	return verifiedKey.id;
}

async function findDocumentAPIKeyContext(
	c: HonoContext<HonoServerContext>,
): Promise<DocumentAPIKeyContext | null> {
	const dbClient = c.get("dbClient");
	const verifiedAPIKeyId = requireVerifiedAPIKeyId(c);
	const [keyContext] = await dbClient
		.select({
			deviceId: apikeys.deviceId,
			organizationId: apikeys.organizationId,
		})
		.from(apikeys)
		.where(eq(apikeys.id, verifiedAPIKeyId))
		.limit(1);

	return keyContext ?? null;
}

documentsRouter.get(
	"/documents",
	requireAPIKey,
	requireAPIKeyPermission("documents", "list"),
	async (c) => {
		const keyContext = await findDocumentAPIKeyContext(c);
		const s3Client = c.get("s3Client");
		const dbClient = c.get("dbClient");

		if (!keyContext || !keyContext.deviceId) {
			return c.json({ message: "Invalid API key context" }, 401);
		}

		const limitParam = c.req.query("limit");
		const cursor = c.req.query("cursor");
		const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);

		const conditions = [eq(documents.deviceId, keyContext.deviceId)];
		if (cursor) {
			conditions.push(lt(documents.id, cursor));
		}

		const rows = await dbClient
			.select({
				id: documents.id,
				objectKey: documents.objectKey,
				contentType: documents.contentType,
				sizeBytes: documents.sizeBytes,
				createdAt: documents.createdAt,
				description: documentDescriptions.text,
				visibility: documents.visibility,
				deviceId: documents.deviceId,
			})
			.from(documents)
			.leftJoin(
				documentDescriptions,
				eq(documents.id, documentDescriptions.documentId),
			)
			.where(and(...conditions))
			.orderBy(desc(documents.id))
			.limit(limit + 1);

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

		const docs = page.map((row) => toAPIDocumentItem(row, s3Client));

		return c.json({ documents: docs, nextCursor });
	},
);

documentsRouter.get(
	"/documents/:id",
	requireAPIKey,
	requireAPIKeyPermission("documents", "read"),
	async (c) => {
		const keyContext = await findDocumentAPIKeyContext(c);
		const s3Client = c.get("s3Client");
		const dbClient = c.get("dbClient");
		const documentId = c.req.param("id");

		const [row] = await dbClient
			.select({
				id: documents.id,
				objectKey: documents.objectKey,
				contentType: documents.contentType,
				sizeBytes: documents.sizeBytes,
				createdAt: documents.createdAt,
				description: documentDescriptions.text,
				deviceId: documents.deviceId,
				organizationId: documents.organizationId,
				visibility: documents.visibility,
			})
			.from(documents)
			.leftJoin(
				documentDescriptions,
				eq(documents.id, documentDescriptions.documentId),
			)
			.where(eq(documents.id, documentId))
			.limit(1);

		if (!row) {
			return c.json({ message: "Document not found" }, 404);
		}

		if (!keyContext || keyContext.deviceId !== row.deviceId) {
			return c.json({ message: "Document not found" }, 404);
		}

		return c.json(toAPIDocumentItem(row, s3Client));
	},
);

documentsRouter.get(
	"/documents/:id/similar",
	requireAPIKey,
	requireAPIKeyPermission("documents", "similar"),
	async (c) => {
		const keyContext = await findDocumentAPIKeyContext(c);
		const s3Client = c.get("s3Client");
		const dbClient = c.get("dbClient");
		const documentId = c.req.param("id");

		const limitParam = c.req.query("limit");
		const limit = Math.min(Math.max(Number(limitParam) || 5, 1), 20);

		if (!keyContext || !keyContext.deviceId) {
			return c.json({ message: "Invalid API key context" }, 401);
		}

		const [sourceDoc] = await dbClient
			.select({ id: documents.id, deviceId: documents.deviceId })
			.from(documents)
			.where(eq(documents.id, documentId))
			.limit(1);

		if (!sourceDoc || sourceDoc.deviceId !== keyContext.deviceId) {
			return c.json({ message: "Document not found" }, 404);
		}

		const similarRows = await dbClient.execute(sql`
		SELECT
			d.id,
			d.object_key AS "objectKey",
			d.content_type AS "contentType",
			d.size_bytes AS "sizeBytes",
			d.created_at AS "createdAt",
			dd.text AS description,
			d.visibility AS visibility,
			d.device_id AS "deviceId",
			(dde2.embedding <=> dde1.embedding) AS distance
		FROM document_description_embeddings dde1
		JOIN document_descriptions dd1 ON dd1.id = dde1.document_description_id
		JOIN document_description_embeddings dde2
			ON dde2.embedding_dim = dde1.embedding_dim
			AND dde2.id != dde1.id
		JOIN document_descriptions dd2 ON dd2.id = dde2.document_description_id
		JOIN documents d ON d.id = dd2.document_id
		LEFT JOIN document_descriptions dd ON dd.document_id = d.id
		WHERE dd1.document_id = ${documentId}
			AND d.organization_id = ${keyContext.organizationId}
			AND d.id != ${documentId}
		ORDER BY distance ASC
		LIMIT ${limit}
	`);

		const matches = similarRows.rows.map((row: Record<string, unknown>) =>
			toAPIDocumentItem(
				{
					id: row.id as string,
					objectKey: row.objectKey as string,
					contentType: row.contentType as string,
					sizeBytes: row.sizeBytes as number | string,
					createdAt: row.createdAt as Date | string,
					description: (row.description as string | null) ?? null,
					visibility: row.visibility as string,
					deviceId: (row.deviceId as string | null) ?? null,
					distance: row.distance as number | string | null,
				} satisfies APIDocumentRow,
				s3Client,
			),
		);

		return c.json({ matches });
	},
);
