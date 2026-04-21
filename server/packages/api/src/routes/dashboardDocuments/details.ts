import { schema } from "@arcnem-vision/db";
import { desc, eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import {
	type DocumentOCRRow,
	type DocumentSegmentationRow,
	findDashboardDocumentById,
	resolveAccessibleDashboardDocument,
	toOCRResultItem,
	toSegmentedResultItem,
} from "@/lib/dashboard-documents";
import { findActiveWorkflowById } from "@/lib/workflow-run-availability";
import { requireSession } from "@/middleware/requireSession";
import type { HonoServerContext } from "@/types/serverContext";

const { documentOCRResults, models } = schema;

function readDashboardDocumentId(value: string | undefined) {
	return value?.trim() ?? "";
}

export function registerDashboardDocumentDetailRoutes(
	router: Hono<HonoServerContext>,
) {
	router.get("/dashboard/documents/:id", requireSession, async (c) => {
		const documentId = readDashboardDocumentId(c.req.param("id"));
		if (!documentId) {
			return c.json({ message: "documentId is required" }, 400);
		}

		const documentAccess = await resolveAccessibleDashboardDocument(
			c,
			documentId,
		);
		if ("message" in documentAccess) {
			return c.json({ message: documentAccess.message }, documentAccess.status);
		}

		const document = await findDashboardDocumentById(c, documentId);
		if (!document) {
			return c.json({ message: "Document not found" }, 404);
		}

		return c.json(document);
	});

	router.post("/dashboard/documents/:id/run", requireSession, async (c) => {
		const documentId = readDashboardDocumentId(c.req.param("id"));
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
		const documentAccess = await resolveAccessibleDashboardDocument(
			c,
			documentId,
		);
		if ("message" in documentAccess) {
			return c.json({ message: documentAccess.message }, documentAccess.status);
		}
		const { document: targetDocument } = documentAccess;

		const workflow = await findActiveWorkflowById(
			dbClient,
			targetDocument.organizationId,
			workflowId.trim(),
		);
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
	});

	router.get("/dashboard/documents/:id/ocr", requireSession, async (c) => {
		const documentId = readDashboardDocumentId(c.req.param("id"));
		if (!documentId) {
			return c.json({ message: "documentId is required" }, 400);
		}

		const dbClient = c.get("dbClient");
		const documentAccess = await resolveAccessibleDashboardDocument(
			c,
			documentId,
		);
		if ("message" in documentAccess) {
			return c.json({ message: documentAccess.message }, documentAccess.status);
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
	});

	router.get(
		"/dashboard/documents/:id/segmentations",
		requireSession,
		async (c) => {
			const documentId = readDashboardDocumentId(c.req.param("id"));
			if (!documentId) {
				return c.json({ message: "documentId is required" }, 400);
			}

			const dbClient = c.get("dbClient");
			const documentAccess = await resolveAccessibleDashboardDocument(
				c,
				documentId,
			);
			if ("message" in documentAccess) {
				return c.json(
					{ message: documentAccess.message },
					documentAccess.status,
				);
			}
			const { document: sourceDocument } = documentAccess;

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
					d.api_key_id AS "apiKeyId"
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
					toSegmentedResultItem(
						row as DocumentSegmentationRow,
						c.get("s3Client"),
					),
				),
			});
		},
	);
}
