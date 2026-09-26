import { schema } from "@arcnem-vision/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { Hono, type Context as HonoContext } from "hono";
import { findSimilarKeyDocuments, toAPIDocumentItem } from "@/lib/document-api";
import {
	requireAPIKey,
	requireAPIKeyPermission,
	requireWorkflowAPIKey,
} from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";

const { apikeys, documents, documentDescriptions } = schema;

export const documentsRouter = new Hono<HonoServerContext>({
	strict: false,
});

type DocumentAPIKeyContext = {
	apiKeyId: string;
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
			apiKeyId: apikeys.id,
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
	requireWorkflowAPIKey,
	requireAPIKeyPermission("documents", "list"),
	async (c) => {
		const keyContext = await findDocumentAPIKeyContext(c);
		const s3Client = c.get("s3Client");
		const dbClient = c.get("dbClient");

		if (!keyContext) {
			return c.json({ message: "Invalid API key context" }, 401);
		}

		const limitParam = c.req.query("limit");
		const cursor = c.req.query("cursor");
		const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);

		const conditions = [eq(documents.apiKeyId, keyContext.apiKeyId)];
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
				apiKeyId: documents.apiKeyId,
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
	requireWorkflowAPIKey,
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
				apiKeyId: documents.apiKeyId,
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

		if (!keyContext || keyContext.apiKeyId !== row.apiKeyId) {
			return c.json({ message: "Document not found" }, 404);
		}

		return c.json(toAPIDocumentItem(row, s3Client));
	},
);

documentsRouter.get(
	"/documents/:id/similar",
	requireAPIKey,
	requireWorkflowAPIKey,
	requireAPIKeyPermission("documents", "similar"),
	async (c) => {
		const keyContext = await findDocumentAPIKeyContext(c);
		const s3Client = c.get("s3Client");
		const dbClient = c.get("dbClient");
		const documentId = c.req.param("id");

		const limitParam = c.req.query("limit");
		const limit = Math.min(Math.max(Number(limitParam) || 5, 1), 20);

		if (!keyContext) {
			return c.json({ message: "Invalid API key context" }, 401);
		}

		const [sourceDoc] = await dbClient
			.select({ id: documents.id, apiKeyId: documents.apiKeyId })
			.from(documents)
			.where(eq(documents.id, documentId))
			.limit(1);

		if (!sourceDoc || sourceDoc.apiKeyId !== keyContext.apiKeyId) {
			return c.json({ message: "Document not found" }, 404);
		}

		const similarRows = await findSimilarKeyDocuments(dbClient, {
			documentId,
			apiKeyId: keyContext.apiKeyId,
			limit,
		});
		const matches = similarRows.map((row) => toAPIDocumentItem(row, s3Client));

		return c.json({ matches });
	},
);
