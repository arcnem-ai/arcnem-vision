import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	readDocumentContextOutputSchema,
	type ServiceDocumentListQuery,
	serviceDocumentSearchResponseSchema,
} from "@arcnem-vision/shared";
import type { S3Client } from "bun";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	sql,
} from "drizzle-orm";
import { getApiMcpClient } from "@/clients/apiMcpClient";
import { toAPIDocumentItem } from "./document-api";
import { ServiceError } from "./service-error";
import {
	type ProjectScope,
	resolveScopedDocumentIds,
} from "./service-workflows";

const {
	documents,
	documentDescriptions,
	agentGraphRuns,
	agentGraphs,
	agentGraphRunSteps,
} = schema;
const documentColumns = {
	id: documents.id,
	objectKey: documents.objectKey,
	contentType: documents.contentType,
	sizeBytes: documents.sizeBytes,
	createdAt: documents.createdAt,
	description: documentDescriptions.text,
	visibility: documents.visibility,
	apiKeyId: documents.apiKeyId,
};

export async function listServiceDocuments(
	db: PGDB,
	s3: S3Client,
	scope: ProjectScope,
	input: ServiceDocumentListQuery,
) {
	const limit = input.limit ?? 20;
	const rows = await db
		.select(documentColumns)
		.from(documents)
		.leftJoin(
			documentDescriptions,
			eq(documents.id, documentDescriptions.documentId),
		)
		.where(
			and(
				eq(documents.organizationId, scope.organizationId),
				eq(documents.projectId, scope.projectId),
				input.cursor ? lt(documents.id, input.cursor) : undefined,
				input.documentIds?.length
					? inArray(documents.id, input.documentIds)
					: undefined,
				input.apiKeyIds?.length
					? inArray(documents.apiKeyId, input.apiKeyIds)
					: undefined,
				input.apiKeyBound === true
					? isNotNull(documents.apiKeyId)
					: input.apiKeyBound === false
						? isNull(documents.apiKeyId)
						: undefined,
			),
		)
		.orderBy(desc(documents.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	return {
		documents: page.map((row) => toAPIDocumentItem(row, s3)),
		nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
	};
}

export async function getServiceDocument(
	db: PGDB,
	s3: S3Client,
	scope: ProjectScope,
	documentId: string,
) {
	const [row] = await db
		.select(documentColumns)
		.from(documents)
		.leftJoin(
			documentDescriptions,
			eq(documents.id, documentDescriptions.documentId),
		)
		.where(
			and(
				eq(documents.id, documentId),
				eq(documents.organizationId, scope.organizationId),
				eq(documents.projectId, scope.projectId),
			),
		)
		.limit(1);
	if (!row) throw new ServiceError(404, "Document not found");
	return toAPIDocumentItem(row, s3);
}

export async function searchServiceDocuments(
	db: PGDB,
	scope: ProjectScope,
	input: { query: string; documentIds?: string[]; limit?: number },
) {
	if (input.documentIds) {
		const selection = await resolveScopedDocumentIds(db, scope, {
			documentIds: input.documentIds,
		});
		if (!selection.ok)
			throw new ServiceError(
				selection.status,
				selection.body.message,
				selection.body,
			);
	}
	try {
		const response = await getApiMcpClient().callTool<unknown>(
			"search_documents_in_scope",
			{
				query: input.query,
				limit: input.limit ?? 5,
				scope: {
					organization_id: scope.organizationId,
					project_ids: [scope.projectId],
					...(input.documentIds ? { document_ids: input.documentIds } : {}),
				},
			},
		);
		const parsed = serviceDocumentSearchResponseSchema.parse(response);
		if (
			parsed.matches.some(
				(match) =>
					match.projectId !== scope.projectId ||
					(input.documentIds && !input.documentIds.includes(match.documentId)),
			)
		) {
			throw new Error(
				"Search returned a document outside the authorized scope",
			);
		}
		return parsed;
	} catch {
		throw new ServiceError(502, "Document search failed");
	}
}

export async function readServiceDocumentContext(
	db: PGDB,
	scope: ProjectScope,
	documentId: string,
) {
	const selection = await resolveScopedDocumentIds(db, scope, {
		documentIds: [documentId],
	});
	if (!selection.ok)
		throw new ServiceError(
			selection.status,
			selection.body.message,
			selection.body,
		);
	try {
		const parsed = readDocumentContextOutputSchema.parse(
			await getApiMcpClient().callTool<unknown>("read_document_context", {
				document_ids: [documentId],
				scope: {
					organization_id: scope.organizationId,
					project_ids: [scope.projectId],
					document_ids: [documentId],
				},
			}),
		);
		if (
			parsed.documents.some(
				(document) =>
					document.documentId !== documentId ||
					document.projectId !== scope.projectId,
			)
		)
			throw new Error("Document outside scope");
		return parsed.documents[0] ?? null;
	} catch {
		throw new ServiceError(502, "Document context could not be read");
	}
}

export async function listServiceExecutions(
	db: PGDB,
	scope: ProjectScope,
	input: { workflowId?: string; cursor?: string; limit?: number },
) {
	const limit = input.limit ?? 20;
	const filters = and(
		eq(agentGraphs.organizationId, scope.organizationId),
		eq(agentGraphRuns.projectId, scope.projectId),
		input.workflowId
			? eq(agentGraphRuns.agentGraphId, input.workflowId)
			: undefined,
	);
	const cursor = input.cursor
		? db
				.select({ startedAt: agentGraphRuns.startedAt, id: agentGraphRuns.id })
				.from(agentGraphRuns)
				.innerJoin(agentGraphs, eq(agentGraphRuns.agentGraphId, agentGraphs.id))
				.where(and(filters, eq(agentGraphRuns.id, input.cursor)))
		: undefined;
	const rows = await db
		.select({
			executionId: agentGraphRuns.id,
			workflowId: agentGraphRuns.agentGraphId,
			workflowName: agentGraphs.name,
			status: agentGraphRuns.status,
			startedAt: agentGraphRuns.startedAt,
			finishedAt: agentGraphRuns.finishedAt,
			snapshotHash: agentGraphRuns.graphSnapshotHash,
		})
		.from(agentGraphRuns)
		.innerJoin(agentGraphs, eq(agentGraphRuns.agentGraphId, agentGraphs.id))
		.where(
			and(
				filters,
				cursor
					? sql`(${agentGraphRuns.startedAt}, ${agentGraphRuns.id}) < ${cursor}`
					: undefined,
			),
		)
		.orderBy(desc(agentGraphRuns.startedAt), desc(agentGraphRuns.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	return {
		executions: page,
		nextCursor: rows.length > limit ? (page.at(-1)?.executionId ?? null) : null,
	};
}

export async function getServiceExecution(
	db: PGDB,
	scope: ProjectScope,
	executionId: string,
) {
	const [row] = await db
		.select({
			executionId: agentGraphRuns.id,
			workflowId: agentGraphRuns.agentGraphId,
			snapshotHash: agentGraphRuns.graphSnapshotHash,
			status: agentGraphRuns.status,
			startedAt: agentGraphRuns.startedAt,
			finishedAt: agentGraphRuns.finishedAt,
			error: agentGraphRuns.error,
			finalState: agentGraphRuns.finalState,
		})
		.from(agentGraphRuns)
		.innerJoin(agentGraphs, eq(agentGraphRuns.agentGraphId, agentGraphs.id))
		.where(
			and(
				eq(agentGraphRuns.id, executionId),
				eq(agentGraphs.organizationId, scope.organizationId),
				eq(agentGraphRuns.projectId, scope.projectId),
			),
		)
		.limit(1);
	if (!row) throw new ServiceError(404, "Execution not found");
	return {
		...row,
		startedAt: row.startedAt?.toISOString() ?? null,
		finishedAt: row.finishedAt?.toISOString() ?? null,
		finalState: row.finalState ?? null,
	};
}

export async function getServiceExecutionSteps(
	db: PGDB,
	scope: ProjectScope,
	executionId: string,
	input: { stepCursor?: number; limit?: number },
) {
	await getServiceExecution(db, scope, executionId);
	const limit = input.limit ?? 20;
	const rows = await db
		.select({
			nodeKey: agentGraphRunSteps.nodeKey,
			stepOrder: agentGraphRunSteps.stepOrder,
			stateDelta: agentGraphRunSteps.stateDelta,
			startedAt: agentGraphRunSteps.startedAt,
			finishedAt: agentGraphRunSteps.finishedAt,
		})
		.from(agentGraphRunSteps)
		.where(
			and(
				eq(agentGraphRunSteps.runId, executionId),
				gt(agentGraphRunSteps.stepOrder, input.stepCursor ?? 0),
			),
		)
		.orderBy(asc(agentGraphRunSteps.stepOrder))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	return {
		steps: page,
		nextStepCursor:
			rows.length > limit ? (page.at(-1)?.stepOrder ?? null) : null,
	};
}
