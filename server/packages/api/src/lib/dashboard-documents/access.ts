import { schema } from "@arcnem-vision/db";
import { and, eq, sql } from "drizzle-orm";
import type { Context as HonoContext } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { toDocumentItem } from "./presenters";
import type {
	DashboardDocumentAccessResolution,
	DashboardDocumentItem,
	DashboardDocumentOrganization,
	DashboardOrganizationResolution,
} from "./types";

const { documents, documentDescriptions } = schema;

export const topLevelDocumentCondition = sql`NOT EXISTS (
	SELECT 1
	FROM document_segmentations ds_hidden
	WHERE ds_hidden.segmented_document_id = ${documents.id}
)`;

export async function hasDashboardOrganizationAccess(
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

export async function resolveDashboardOrganizationId(
	c: HonoContext<HonoServerContext>,
	requestedOrganizationId: string,
): Promise<DashboardOrganizationResolution> {
	const organizationId = requestedOrganizationId.trim();
	const dbClient = c.get("dbClient");
	const session = c.get("session");
	const user = c.get("user");

	if (!session || !user) {
		if (!organizationId) {
			return {
				status: 400,
				message:
					"organizationId is required when no session context is available",
			};
		}

		return { organizationId };
	}

	const activeOrganizationId =
		(session as { activeOrganizationId?: string | null })
			.activeOrganizationId ?? null;
	if (activeOrganizationId) {
		return { organizationId: activeOrganizationId };
	}

	if (!organizationId) {
		return {
			status: 400,
			message:
				"organizationId is required when no active organization is selected",
		};
	}

	const membership = await dbClient.query.members.findFirst({
		where: (row, { and, eq }) =>
			and(eq(row.userId, user.id), eq(row.organizationId, organizationId)),
		columns: {
			organizationId: true,
		},
	});
	if (!membership) {
		return {
			status: 403,
			message: "organizationId is not available for this session",
		};
	}

	return {
		organizationId: membership.organizationId,
	};
}

export async function findDashboardDocumentOrganization(
	c: HonoContext<HonoServerContext>,
	documentId: string,
): Promise<DashboardDocumentOrganization | null> {
	const dbClient = c.get("dbClient");
	const [document] = await dbClient
		.select({
			id: documents.id,
			organizationId: documents.organizationId,
		})
		.from(documents)
		.where(eq(documents.id, documentId))
		.limit(1);

	return document ?? null;
}

export async function resolveAccessibleDashboardDocument(
	c: HonoContext<HonoServerContext>,
	documentId: string,
): Promise<DashboardDocumentAccessResolution> {
	const document = await findDashboardDocumentOrganization(c, documentId);
	if (!document) {
		return {
			status: 404,
			message: "Document not found",
		};
	}

	if (!(await hasDashboardOrganizationAccess(c, document.organizationId))) {
		return {
			status: 403,
			message: "documentId is not available for this session",
		};
	}

	return { document };
}

export async function findDashboardDocumentById(
	c: HonoContext<HonoServerContext>,
	documentId: string,
): Promise<DashboardDocumentItem | null> {
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
			apiKeyId: documents.apiKeyId,
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

	return toDocumentItem(
		{
			...targetDocument,
			distance: null,
		},
		c.get("s3Client"),
	);
}
