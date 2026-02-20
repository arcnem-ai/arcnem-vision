import { schema } from "@arcnem-vision/db";
import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getS3Client } from "@/clients/s3";
import { requireSession } from "@/middleware/requireSession";
import type { HonoServerContext } from "@/types/serverContext";

const s3Client = getS3Client();
const { documents, documentDescriptions } = schema;

const PRESIGN_GET_EXPIRES_IN_SECONDS = 60 * 5;

export const dashboardDocumentsRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardDocumentsRouter.get(
	"/dashboard/documents",
	requireSession,
	async (c) => {
		const requestedOrganizationId = c.req.query("organizationId")?.trim() ?? "";
		if (!requestedOrganizationId) {
			return c.json({ message: "organizationId is required" }, 400);
		}

		const dbClient = c.get("dbClient");
		const session = c.get("session");
		const user = c.get("user");

		let organizationId = requestedOrganizationId;
		// In normal auth mode, lock document access to the active session organization.
		// In local debug mode, requireSession is bypassed and we allow the query param.
		if (session && user) {
			const activeOrganizationId =
				(session as { activeOrganizationId?: string | null })
					.activeOrganizationId ?? null;
			if (
				activeOrganizationId &&
				activeOrganizationId !== requestedOrganizationId
			) {
				return c.json(
					{
						message:
							"organizationId must match your active organization context",
					},
					403,
				);
			}
			if (activeOrganizationId) {
				organizationId = activeOrganizationId;
			} else {
				const membership = await dbClient.query.members.findFirst({
					where: (row, { and, eq }) =>
						and(
							eq(row.userId, user.id),
							eq(row.organizationId, requestedOrganizationId),
						),
					columns: {
						organizationId: true,
					},
				});
				if (!membership) {
					return c.json(
						{ message: "organizationId is not available for this session" },
						403,
					);
				}
				organizationId = membership.organizationId;
			}
		}

		const limitParam = c.req.query("limit");
		const cursor = c.req.query("cursor");
		const query = c.req.query("query")?.trim() ?? "";
		const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);

		if (query.length > 0) {
			if (query.length > 160) {
				return c.json(
					{ message: "query must be 160 characters or fewer" },
					400,
				);
			}

			const pattern = `%${query}%`;
			const seedRows = await dbClient.execute(sql`
				SELECT dd.id AS "descriptionId"
				FROM document_descriptions dd
				INNER JOIN document_description_embeddings dde
					ON dde.document_description_id = dd.id
				INNER JOIN documents d
					ON d.id = dd.document_id
				WHERE d.organization_id = ${organizationId}
					AND dd.text ILIKE ${pattern}
				ORDER BY d.created_at DESC
				LIMIT 1
			`);

			const seedDescriptionId =
				(seedRows.rows[0] as { descriptionId?: string } | undefined)
					?.descriptionId ?? null;

			if (seedDescriptionId) {
				const semanticRows = await dbClient.execute(sql`
					WITH ranked AS (
						SELECT DISTINCT ON (d.id)
							d.id,
							d.object_key AS "objectKey",
							d.content_type AS "contentType",
							d.size_bytes AS "sizeBytes",
							d.created_at AS "createdAt",
							dd_target.text AS description,
							(dde_target.embedding <=> dde_seed.embedding) AS distance
						FROM document_description_embeddings dde_seed
						INNER JOIN document_descriptions dd_seed
							ON dd_seed.id = dde_seed.document_description_id
						INNER JOIN document_description_embeddings dde_target
							ON dde_target.embedding_dim = dde_seed.embedding_dim
						INNER JOIN document_descriptions dd_target
							ON dd_target.id = dde_target.document_description_id
						INNER JOIN documents d
							ON d.id = dd_target.document_id
						WHERE dd_seed.id = ${seedDescriptionId}
							AND d.organization_id = ${organizationId}
						ORDER BY d.id, distance ASC
					)
					SELECT *
					FROM ranked
					ORDER BY distance ASC, "createdAt" DESC
					LIMIT ${limit}
				`);

				const docs = semanticRows.rows.map((row) => {
					const data = row as {
						id: string;
						objectKey: string;
						contentType: string;
						sizeBytes: number | string;
						createdAt: string;
						description: string | null;
						distance: number | string | null;
					};
					return {
						id: data.id,
						objectKey: data.objectKey,
						contentType: data.contentType,
						sizeBytes: Number(data.sizeBytes),
						createdAt: data.createdAt,
						description: data.description,
						distance: data.distance == null ? null : Number(data.distance),
						thumbnailUrl: s3Client.presign(data.objectKey, {
							method: "GET",
							expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
						}),
					};
				});

				return c.json({ documents: docs, nextCursor: null });
			}

			const lexicalRows = await dbClient
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
				.where(
					and(
						eq(documents.organizationId, organizationId),
						or(
							ilike(documentDescriptions.text, pattern),
							ilike(documents.objectKey, pattern),
						),
					),
				)
				.orderBy(desc(documents.id))
				.limit(limit);

			const docs = lexicalRows.map((row) => ({
				id: row.id,
				objectKey: row.objectKey,
				contentType: row.contentType,
				sizeBytes: row.sizeBytes,
				createdAt: row.createdAt,
				description: row.description,
				distance: null,
				thumbnailUrl: s3Client.presign(row.objectKey, {
					method: "GET",
					expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
				}),
			}));

			return c.json({ documents: docs, nextCursor: null });
		}

		const conditions = [eq(documents.organizationId, organizationId)];
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
			distance: null,
			thumbnailUrl: s3Client.presign(row.objectKey, {
				method: "GET",
				expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
			}),
		}));

		return c.json({ documents: docs, nextCursor });
	},
);
