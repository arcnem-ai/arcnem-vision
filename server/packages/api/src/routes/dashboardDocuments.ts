import { schema } from "@arcnem-vision/db";
import {
	createDashboardRealtimeEvent,
	DASHBOARD_REALTIME_REASON,
} from "@arcnem-vision/shared";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { Hono, type Context as HonoContext } from "hono";
import { getApiMcpClient } from "@/clients/apiMcpClient";
import { getS3Client } from "@/clients/s3";
import {
	ALLOWED_IMAGE_MIME_TYPES,
	MAX_UPLOAD_SIZE_BYTES,
	MIME_TYPE_TO_EXTENSION,
	PRESIGN_EXPIRES_IN_SECONDS,
} from "@/constants/uploads";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { publishDashboardRealtimeEvent } from "@/lib/dashboard-realtime";
import { requireSession } from "@/middleware/requireSession";
import type { HonoServerContext } from "@/types/serverContext";

const s3Client = getS3Client();
const S3_BUCKET = getAPIEnvVar("S3_BUCKET");
const {
	documents,
	documentDescriptions,
	documentOCRResults,
	models,
	organizations,
	presignedUploads,
	projects,
} = schema;

const PRESIGN_GET_EXPIRES_IN_SECONDS = 60 * 5;

export const dashboardDocumentsRouter = new Hono<HonoServerContext>({
	strict: false,
});

type DocumentRow = {
	id: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number | string;
	createdAt: Date | string;
	description: string | null;
	distance: number | string | null;
	projectId: string;
	deviceId: string | null;
};

type DocumentSegmentationRow = DocumentRow & {
	segmentationId: string;
	segmentationCreatedAt: Date | string;
	modelLabel: string;
	prompt: string | null;
};

type DocumentOCRRow = {
	ocrResultId: string;
	ocrCreatedAt: Date | string;
	modelLabel: string;
	text: string;
	avgConfidence: number | string | null;
	result: unknown;
};

type DashboardDocumentSearchMatch = {
	documentId: string;
	objectKey: string;
	contentType: string;
	sizeBytes: number;
	createdAt: string;
	projectId: string;
	deviceId: string | null;
	snippet: string;
};

const topLevelDocumentCondition = sql`NOT EXISTS (
	SELECT 1
	FROM document_segmentations ds_hidden
	WHERE ds_hidden.segmented_document_id = ${documents.id}
)`;

async function hasDashboardOrganizationAccess(
	c: HonoContext<HonoServerContext>,
	organizationId: string,
) {
	const dbClient = c.get("dbClient");
	const session = c.get("session");
	const user = c.get("user");

	if (!session || !user) {
		return true;
	}

	const activeOrganizationId =
		(session as { activeOrganizationId?: string | null })
			.activeOrganizationId ?? null;
	if (activeOrganizationId) {
		return activeOrganizationId === organizationId;
	}

	const membership = await dbClient.query.members.findFirst({
		where: (row, { and, eq }) =>
			and(eq(row.userId, user.id), eq(row.organizationId, organizationId)),
		columns: {
			organizationId: true,
		},
	});

	return Boolean(membership);
}

function toDocumentItem(row: DocumentRow) {
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
		distance: row.distance == null ? null : Number(row.distance),
		projectId: row.projectId,
		deviceId: row.deviceId,
		thumbnailUrl: s3Client.presign(row.objectKey, {
			method: "GET",
			expiresIn: PRESIGN_GET_EXPIRES_IN_SECONDS,
		}),
	};
}

function toSegmentedResultItem(row: DocumentSegmentationRow) {
	return {
		segmentationId: row.segmentationId,
		segmentationCreatedAt:
			row.segmentationCreatedAt instanceof Date
				? row.segmentationCreatedAt.toISOString()
				: row.segmentationCreatedAt,
		modelLabel: row.modelLabel,
		prompt: row.prompt,
		document: toDocumentItem(row),
	};
}

function toOCRResultItem(row: DocumentOCRRow) {
	return {
		ocrResultId: row.ocrResultId,
		ocrCreatedAt:
			row.ocrCreatedAt instanceof Date
				? row.ocrCreatedAt.toISOString()
				: row.ocrCreatedAt,
		modelLabel: row.modelLabel,
		text: row.text,
		avgConfidence: row.avgConfidence == null ? null : Number(row.avgConfidence),
		result: row.result,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseDashboardDocumentSearchMatches(
	payload: unknown,
): DashboardDocumentSearchMatch[] {
	if (!isRecord(payload) || !Array.isArray(payload.matches)) {
		throw new Error(
			"MCP search_documents_in_scope returned an invalid payload.",
		);
	}

	return payload.matches.map((match, index) => {
		if (
			!isRecord(match) ||
			typeof match.documentId !== "string" ||
			typeof match.objectKey !== "string" ||
			typeof match.contentType !== "string" ||
			typeof match.createdAt !== "string" ||
			typeof match.projectId !== "string" ||
			typeof match.snippet !== "string"
		) {
			throw new Error(
				`MCP search_documents_in_scope returned an invalid match at index ${index}.`,
			);
		}

		const sizeBytes =
			typeof match.sizeBytes === "number"
				? match.sizeBytes
				: typeof match.sizeBytes === "string"
					? Number(match.sizeBytes)
					: Number.NaN;
		if (!Number.isFinite(sizeBytes)) {
			throw new Error(
				`MCP search_documents_in_scope returned an invalid sizeBytes at index ${index}.`,
			);
		}

		const deviceId = typeof match.deviceId === "string" ? match.deviceId : null;

		return {
			documentId: match.documentId,
			objectKey: match.objectKey,
			contentType: match.contentType,
			sizeBytes,
			createdAt: match.createdAt,
			projectId: match.projectId,
			deviceId,
			snippet: match.snippet,
		};
	});
}

function mapDashboardSearchMatchToRow(
	match: DashboardDocumentSearchMatch,
): DocumentRow {
	return {
		id: match.documentId,
		objectKey: match.objectKey,
		contentType: match.contentType,
		sizeBytes: match.sizeBytes,
		createdAt: match.createdAt,
		description: match.snippet,
		distance: null,
		projectId: match.projectId,
		deviceId: match.deviceId,
	};
}

async function searchDashboardDocumentsByMeaning(
	organizationId: string,
	query: string,
	limit: number,
	filters: {
		projectId?: string;
		deviceId?: string;
		dashboardUploadsOnly?: boolean;
	},
) {
	const response = await getApiMcpClient().callTool<unknown>(
		"search_documents_in_scope",
		{
			query,
			limit,
			scope: {
				organization_id: organizationId,
			},
		},
	);

	return parseDashboardDocumentSearchMatches(response)
		.filter((match) => {
			if (filters.projectId && match.projectId !== filters.projectId) {
				return false;
			}
			if (filters.dashboardUploadsOnly) {
				return match.deviceId == null;
			}
			if (filters.deviceId) {
				return match.deviceId === filters.deviceId;
			}
			return true;
		})
		.map(mapDashboardSearchMatchToRow);
}

async function findDashboardDocumentById(
	c: HonoContext<HonoServerContext>,
	documentId: string,
) {
	const dbClient = c.get("dbClient");
	const [targetDocument] = await dbClient
		.select({
			id: documents.id,
			objectKey: documents.objectKey,
			contentType: documents.contentType,
			sizeBytes: documents.sizeBytes,
			createdAt: documents.createdAt,
			description: documentDescriptions.text,
			projectId: documents.projectId,
			deviceId: documents.deviceId,
			organizationId: documents.organizationId,
		})
		.from(documents)
		.leftJoin(
			documentDescriptions,
			eq(documents.id, documentDescriptions.documentId),
		)
		.where(and(eq(documents.id, documentId), topLevelDocumentCondition))
		.limit(1);

	if (!targetDocument) {
		return null;
	}

	if (
		!(await hasDashboardOrganizationAccess(c, targetDocument.organizationId))
	) {
		return null;
	}

	return toDocumentItem({
		...targetDocument,
		distance: null,
	});
}

dashboardDocumentsRouter.post(
	"/dashboard/documents/uploads/presign",
	requireSession,
	async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ message: "Invalid JSON request body" }, 400);
		}

		if (!body || typeof body !== "object") {
			return c.json({ message: "Request body is required" }, 400);
		}

		const { projectId, contentType, size } = body as {
			projectId?: unknown;
			contentType?: unknown;
			size?: unknown;
		};

		if (typeof projectId !== "string" || projectId.trim().length === 0) {
			return c.json({ message: "projectId is required" }, 400);
		}

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

		const dbClient = c.get("dbClient");
		const [uploadTarget] = await dbClient
			.select({
				organizationId: projects.organizationId,
				organizationSlug: organizations.slug,
				projectId: projects.id,
				projectSlug: projects.slug,
			})
			.from(projects)
			.innerJoin(organizations, eq(projects.organizationId, organizations.id))
			.where(eq(projects.id, projectId.trim()))
			.limit(1);

		if (!uploadTarget) {
			return c.json({ message: "Project not found" }, 404);
		}

		if (
			!(await hasDashboardOrganizationAccess(c, uploadTarget.organizationId))
		) {
			return c.json(
				{ message: "projectId is not available for this session" },
				403,
			);
		}

		const extension = MIME_TYPE_TO_EXTENSION[normalizedContentType] ?? "img";
		const dateFolder = new Date().toISOString().slice(0, 10);
		const objectKey = `uploads/${uploadTarget.organizationSlug}/${uploadTarget.projectSlug}/dashboard/${dateFolder}/${crypto.randomUUID()}.${extension}`;
		const uploadUrl = s3Client.presign(objectKey, {
			method: "PUT",
			expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
		});
		const [presignedUpload] = await dbClient
			.insert(presignedUploads)
			.values({
				bucket: S3_BUCKET,
				objectKey,
				organizationId: uploadTarget.organizationId,
				projectId: uploadTarget.projectId,
				deviceId: null,
				status: "issued",
			})
			.returning({
				id: presignedUploads.id,
			});

		if (!presignedUpload) {
			return c.json(
				{ message: "Failed to create presigned upload record" },
				500,
			);
		}

		return c.json({
			presignedUploadId: presignedUpload.id,
			objectKey,
			uploadUrl,
			contentType: normalizedContentType,
			maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
			expiresInSeconds: PRESIGN_EXPIRES_IN_SECONDS,
		});
	},
);

dashboardDocumentsRouter.post(
	"/dashboard/documents/uploads/ack",
	requireSession,
	async (c) => {
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
		const [uploadForKey] = await dbClient
			.select({
				id: presignedUploads.id,
				bucket: presignedUploads.bucket,
				objectKey: presignedUploads.objectKey,
				organizationId: presignedUploads.organizationId,
				projectId: presignedUploads.projectId,
				deviceId: presignedUploads.deviceId,
			})
			.from(presignedUploads)
			.where(
				and(
					eq(presignedUploads.objectKey, objectKey),
					eq(presignedUploads.status, "issued"),
				),
			)
			.limit(1);

		if (!uploadForKey) {
			return c.json({ message: "Upload key is not valid" }, 404);
		}

		if (
			!(await hasDashboardOrganizationAccess(c, uploadForKey.organizationId))
		) {
			return c.json(
				{ message: "objectKey is not available for this session" },
				403,
			);
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
			return c.json(
				{ message: "Uploaded object is missing ETag metadata" },
				409,
			);
		}

		if (Number.isNaN(objectStats.lastModified.getTime())) {
			return c.json(
				{ message: "Uploaded object has invalid lastModified metadata" },
				409,
			);
		}

		type AckResult = {
			documentId: string;
			presignedUploadId: string;
		};

		let result: AckResult;
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

		const [createdDocument] = await dbClient
			.select({
				id: documents.id,
				objectKey: documents.objectKey,
				contentType: documents.contentType,
				sizeBytes: documents.sizeBytes,
				createdAt: documents.createdAt,
				description: documentDescriptions.text,
				projectId: documents.projectId,
				deviceId: documents.deviceId,
			})
			.from(documents)
			.leftJoin(
				documentDescriptions,
				eq(documents.id, documentDescriptions.documentId),
			)
			.where(eq(documents.id, result.documentId))
			.limit(1);

		if (!createdDocument) {
			return c.json(
				{
					message:
						"Upload was acknowledged but the document could not be loaded",
				},
				500,
			);
		}

		await publishDashboardRealtimeEvent(
			createDashboardRealtimeEvent({
				reason: DASHBOARD_REALTIME_REASON.documentCreated,
				organizationId: uploadForKey.organizationId,
				documentId: result.documentId,
			}),
		);

		return c.json({
			status: "verified",
			documentId: result.documentId,
			presignedUploadId: result.presignedUploadId,
			document: toDocumentItem({
				...createdDocument,
				distance: null,
			}),
		});
	},
);

dashboardDocumentsRouter.get(
	"/dashboard/documents/:id",
	requireSession,
	async (c) => {
		const documentId = c.req.param("id")?.trim() ?? "";
		if (!documentId) {
			return c.json({ message: "documentId is required" }, 400);
		}

		const document = await findDashboardDocumentById(c, documentId);
		if (!document) {
			return c.json({ message: "Document not found" }, 404);
		}

		return c.json(document);
	},
);

dashboardDocumentsRouter.post(
	"/dashboard/documents/:id/run",
	requireSession,
	async (c) => {
		const documentId = c.req.param("id")?.trim() ?? "";
		if (!documentId) {
			return c.json({ message: "documentId is required" }, 400);
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

		const { workflowId } = body as {
			workflowId?: unknown;
		};
		if (typeof workflowId !== "string" || workflowId.trim().length === 0) {
			return c.json({ message: "workflowId is required" }, 400);
		}

		const dbClient = c.get("dbClient");
		const inngestClient = c.get("inngestClient");
		const [targetDocument] = await dbClient
			.select({
				id: documents.id,
				organizationId: documents.organizationId,
			})
			.from(documents)
			.where(eq(documents.id, documentId))
			.limit(1);

		if (!targetDocument) {
			return c.json({ message: "Document not found" }, 404);
		}

		if (
			!(await hasDashboardOrganizationAccess(c, targetDocument.organizationId))
		) {
			return c.json(
				{ message: "documentId is not available for this session" },
				403,
			);
		}

		const workflow = await dbClient.query.agentGraphs.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, workflowId.trim()),
					eq(row.organizationId, targetDocument.organizationId),
				),
			columns: {
				id: true,
				name: true,
			},
		});
		if (!workflow) {
			return c.json({ message: "Workflow not found" }, 404);
		}

		try {
			await inngestClient.send({
				name: "document/process.upload",
				data: {
					document_id: targetDocument.id,
					agent_graph_id: workflow.id,
				},
			});
		} catch {
			return c.json({ message: "Failed to enqueue workflow execution" }, 502);
		}

		return c.json({
			status: "queued",
			documentId: targetDocument.id,
			workflowId: workflow.id,
			workflowName: workflow.name,
		});
	},
);

dashboardDocumentsRouter.get(
	"/dashboard/documents/:id/ocr",
	requireSession,
	async (c) => {
		const documentId = c.req.param("id")?.trim() ?? "";
		if (!documentId) {
			return c.json({ message: "documentId is required" }, 400);
		}

		const dbClient = c.get("dbClient");
		const [sourceDocument] = await dbClient
			.select({
				id: documents.id,
				organizationId: documents.organizationId,
			})
			.from(documents)
			.where(eq(documents.id, documentId))
			.limit(1);

		if (!sourceDocument) {
			return c.json({ message: "Document not found" }, 404);
		}

		if (
			!(await hasDashboardOrganizationAccess(c, sourceDocument.organizationId))
		) {
			return c.json(
				{ message: "documentId is not available for this session" },
				403,
			);
		}

		const ocrRows = await dbClient
			.select({
				ocrResultId: documentOCRResults.id,
				ocrCreatedAt: documentOCRResults.createdAt,
				modelLabel: sql<string>`CONCAT(${models.provider}, '/', ${models.name})`,
				text: documentOCRResults.text,
				avgConfidence: documentOCRResults.avgConfidence,
				result: documentOCRResults.result,
			})
			.from(documentOCRResults)
			.innerJoin(models, eq(documentOCRResults.modelId, models.id))
			.where(eq(documentOCRResults.documentId, documentId))
			.orderBy(desc(documentOCRResults.createdAt), desc(documentOCRResults.id));

		return c.json({
			ocrResults: ocrRows.map((row) => toOCRResultItem(row as DocumentOCRRow)),
		});
	},
);

dashboardDocumentsRouter.get(
	"/dashboard/documents/:id/segmentations",
	requireSession,
	async (c) => {
		const documentId = c.req.param("id")?.trim() ?? "";
		if (!documentId) {
			return c.json({ message: "documentId is required" }, 400);
		}

		const dbClient = c.get("dbClient");
		const [sourceDocument] = await dbClient
			.select({
				id: documents.id,
				organizationId: documents.organizationId,
			})
			.from(documents)
			.where(eq(documents.id, documentId))
			.limit(1);

		if (!sourceDocument) {
			return c.json({ message: "Document not found" }, 404);
		}

		if (
			!(await hasDashboardOrganizationAccess(c, sourceDocument.organizationId))
		) {
			return c.json(
				{ message: "documentId is not available for this session" },
				403,
			);
		}

		const segmentedRows = await dbClient.execute(sql`
			SELECT
				ds.id AS "segmentationId",
				ds.created_at AS "segmentationCreatedAt",
				CONCAT(m.provider, '/', m.name) AS "modelLabel",
				COALESCE(ds.input ->> 'text_prompt', ds.input ->> 'prompt') AS prompt,
				d.id,
				d.object_key AS "objectKey",
				d.content_type AS "contentType",
				d.size_bytes AS "sizeBytes",
				d.created_at AS "createdAt",
				dd_latest.text AS description,
				d.project_id AS "projectId",
				d.device_id AS "deviceId"
			FROM document_segmentations ds
			INNER JOIN documents d
				ON d.id = ds.segmented_document_id
			INNER JOIN models m
				ON m.id = ds.model_id
			LEFT JOIN LATERAL (
				SELECT dd.text
				FROM document_descriptions dd
				WHERE dd.document_id = d.id
				ORDER BY dd.created_at DESC
				LIMIT 1
			) dd_latest ON TRUE
			WHERE ds.source_document_id = ${documentId}
				AND d.organization_id = ${sourceDocument.organizationId}
			ORDER BY ds.created_at DESC, d.created_at DESC
		`);

		return c.json({
			segmentedResults: segmentedRows.rows.map((row) =>
				toSegmentedResultItem(row as DocumentSegmentationRow),
			),
		});
	},
);

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
		const projectId = c.req.query("projectId")?.trim() ?? "";
		const deviceId = c.req.query("deviceId")?.trim() ?? "";
		const dashboardUploadsOnly = c.req.query("dashboardUploadsOnly") === "true";
		const limit = Math.min(Math.max(Number(limitParam) || 20, 1), 100);

		if (deviceId && dashboardUploadsOnly) {
			return c.json(
				{
					message: "deviceId cannot be combined with dashboardUploadsOnly",
				},
				400,
			);
		}

		if (query.length > 0) {
			if (query.length > 160) {
				return c.json(
					{ message: "query must be 160 characters or fewer" },
					400,
				);
			}

			const searchRows = await searchDashboardDocumentsByMeaning(
				organizationId,
				query,
				limit,
				{
					projectId: projectId || undefined,
					deviceId: deviceId || undefined,
					dashboardUploadsOnly,
				},
			);
			const docs = searchRows.map((row) => toDocumentItem(row));

			return c.json({ documents: docs, nextCursor: null });
		}

		const conditions = [
			eq(documents.organizationId, organizationId),
			topLevelDocumentCondition,
		];
		if (projectId) {
			conditions.push(eq(documents.projectId, projectId));
		}
		if (dashboardUploadsOnly) {
			conditions.push(isNull(documents.deviceId));
		} else if (deviceId) {
			conditions.push(eq(documents.deviceId, deviceId));
		}
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
				projectId: documents.projectId,
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

		const docs = page.map((row) =>
			toDocumentItem({
				...row,
				distance: null,
			}),
		);

		return c.json({ documents: docs, nextCursor });
	},
);
