import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { topLevelDocumentCondition } from "./access";
import type {
	DashboardDocumentPage,
	DashboardDocumentPageFilters,
	DashboardIssuedUpload,
	DashboardProjectUploadTarget,
} from "./types";

const {
	documents,
	documentDescriptions,
	organizations,
	presignedUploads,
	projects,
} = schema;

export async function findDashboardProjectUploadTarget(
	dbClient: PGDB,
	projectId: string,
): Promise<DashboardProjectUploadTarget | null> {
	const [uploadTarget] = await dbClient
		.select({
			organizationId: projects.organizationId,
			organizationSlug: organizations.slug,
			projectId: projects.id,
			projectSlug: projects.slug,
		})
		.from(projects)
		.innerJoin(organizations, eq(projects.organizationId, organizations.id))
		.where(eq(projects.id, projectId))
		.limit(1);

	return uploadTarget ?? null;
}

export async function findIssuedDashboardUpload(
	dbClient: PGDB,
	objectKey: string,
): Promise<DashboardIssuedUpload | null> {
	const [upload] = await dbClient
		.select({
			id: presignedUploads.id,
			bucket: presignedUploads.bucket,
			objectKey: presignedUploads.objectKey,
			organizationId: presignedUploads.organizationId,
			projectId: presignedUploads.projectId,
			deviceId: presignedUploads.deviceId,
			visibility: presignedUploads.visibility,
		})
		.from(presignedUploads)
		.where(
			and(
				eq(presignedUploads.objectKey, objectKey),
				eq(presignedUploads.status, "issued"),
			),
		)
		.limit(1);

	return upload ?? null;
}

export async function listDashboardDocumentPage(
	dbClient: PGDB,
	filters: DashboardDocumentPageFilters,
): Promise<DashboardDocumentPage> {
	const conditions = [
		eq(documents.organizationId, filters.organizationId),
		topLevelDocumentCondition,
	];
	if (filters.projectId) {
		conditions.push(eq(documents.projectId, filters.projectId));
	}
	if (filters.dashboardUploadsOnly) {
		conditions.push(isNull(documents.deviceId));
	} else if (filters.deviceId) {
		conditions.push(eq(documents.deviceId, filters.deviceId));
	}
	if (filters.cursor) {
		conditions.push(lt(documents.id, filters.cursor));
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
		.limit(filters.limit + 1);

	const hasMore = rows.length > filters.limit;
	const pageRows = hasMore ? rows.slice(0, filters.limit) : rows;

	return {
		rows: pageRows.map((row) => ({
			...row,
			distance: null,
		})),
		nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null,
	};
}
