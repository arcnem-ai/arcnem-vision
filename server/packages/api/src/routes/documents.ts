import { schema } from "@arcnem-vision/db";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getS3Client } from "@/clients/s3";
import { requireAPIKey } from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";

const s3Client = getS3Client();
const {
	apikeys,
	devices,
	documents,
	documentDescriptions,
	organizations,
	projects,
} = schema;

const PRESIGN_GET_EXPIRES_IN_SECONDS = 60 * 5;

export const documentsRouter = new Hono<HonoServerContext>({
	strict: false,
});

documentsRouter.get("/documents", requireAPIKey, async (c) => {
	const verifiedKey = c.get("apiKey");
	if (!verifiedKey) throw new Error("Expected API key");

	const dbClient = c.get("dbClient");

	const [keyContext] = await dbClient
		.select({
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

	if (!keyContext) {
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

	const docs = page.map((row) => ({
		id: row.id,
		objectKey: row.objectKey,
		contentType: row.contentType,
		sizeBytes: row.sizeBytes,
		createdAt: row.createdAt,
		description: row.description,
		thumbnailUrl: s3Client.presign(row.objectKey, {
			method: "GET",
			expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
		}),
	}));

	return c.json({ documents: docs, nextCursor });
});

documentsRouter.get("/documents/:id", requireAPIKey, async (c) => {
	const verifiedKey = c.get("apiKey");
	if (!verifiedKey) throw new Error("Expected API key");

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

	const [keyContext] = await dbClient
		.select({ deviceId: apikeys.deviceId })
		.from(apikeys)
		.where(eq(apikeys.id, verifiedKey.id))
		.limit(1);

	if (!keyContext || keyContext.deviceId !== row.deviceId) {
		return c.json({ message: "Document not found" }, 404);
	}

	return c.json({
		id: row.id,
		objectKey: row.objectKey,
		contentType: row.contentType,
		sizeBytes: row.sizeBytes,
		createdAt: row.createdAt,
		description: row.description,
		thumbnailUrl: s3Client.presign(row.objectKey, {
			method: "GET",
			expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
		}),
	});
});

documentsRouter.get("/documents/:id/similar", requireAPIKey, async (c) => {
	const verifiedKey = c.get("apiKey");
	if (!verifiedKey) throw new Error("Expected API key");

	const dbClient = c.get("dbClient");
	const documentId = c.req.param("id");

	const limitParam = c.req.query("limit");
	const limit = Math.min(Math.max(Number(limitParam) || 5, 1), 20);

	const [keyContext] = await dbClient
		.select({
			deviceId: apikeys.deviceId,
			organizationId: apikeys.organizationId,
		})
		.from(apikeys)
		.where(eq(apikeys.id, verifiedKey.id))
		.limit(1);

	if (!keyContext) {
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

	const matches = similarRows.rows.map((row: Record<string, unknown>) => ({
		id: row.id,
		objectKey: row.objectKey,
		contentType: row.contentType,
		sizeBytes: Number(row.sizeBytes),
		createdAt: row.createdAt,
		description: row.description,
		distance: Number(row.distance),
		thumbnailUrl: s3Client.presign(row.objectKey as string, {
			method: "GET",
			expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
		}),
	}));

	return c.json({ matches });
});
