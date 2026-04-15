import type { Hono } from "hono";
import {
	findDashboardDocumentById,
	findDashboardProjectUploadTarget,
	findIssuedDashboardUpload,
	hasDashboardOrganizationAccess,
} from "@/lib/dashboard-documents";
import {
	acknowledgePresignedUpload,
	isDocumentVisibility,
	issuePresignedUpload,
	parseAckRequestBody,
	parsePresignRequestBody,
	readJSONBody,
	toDocumentUploadErrorResponse,
} from "@/lib/document-uploads";
import { requireSession } from "@/middleware/requireSession";
import type { HonoServerContext } from "@/types/serverContext";

export function registerDashboardDocumentUploadRoutes(
	router: Hono<HonoServerContext>,
) {
	router.post(
		"/dashboard/documents/uploads/presign",
		requireSession,
		async (c) => {
			try {
				const body = await readJSONBody(c.req);
				const { projectId } = body as {
					projectId?: unknown;
				};
				if (typeof projectId !== "string" || projectId.trim().length === 0) {
					return c.json({ message: "projectId is required" }, 400);
				}

				const { contentType } = parsePresignRequestBody(body);
				const dbClient = c.get("dbClient");
				const uploadTarget = await findDashboardProjectUploadTarget(
					dbClient,
					projectId.trim(),
				);

				if (!uploadTarget) {
					return c.json({ message: "Project not found" }, 404);
				}

				if (
					!(await hasDashboardOrganizationAccess(
						c,
						uploadTarget.organizationId,
					))
				) {
					return c.json(
						{ message: "projectId is not available for this session" },
						403,
					);
				}

				return c.json(
					await issuePresignedUpload({
						dbClient,
						s3Client: c.get("s3Client"),
						target: {
							...uploadTarget,
							deviceId: null,
							objectKeySource: "dashboard",
						},
						contentType,
						documentVisibility: "org",
					}),
				);
			} catch (error) {
				return toDocumentUploadErrorResponse(
					c,
					error,
					"Failed to create presigned upload",
				);
			}
		},
	);

	router.post("/dashboard/documents/uploads/ack", requireSession, async (c) => {
		try {
			const dbClient = c.get("dbClient");
			const body = await readJSONBody(c.req);
			const { objectKey } = parseAckRequestBody(body);
			const uploadForKey = await findIssuedDashboardUpload(dbClient, objectKey);

			if (!uploadForKey) {
				return c.json({ message: "Upload objectKey is not valid" }, 404);
			}

			if (
				!(await hasDashboardOrganizationAccess(c, uploadForKey.organizationId))
			) {
				return c.json(
					{ message: "objectKey is not available for this session" },
					403,
				);
			}

			if (!isDocumentVisibility(uploadForKey.visibility)) {
				return c.json({ message: "Upload has invalid visibility" }, 500);
			}

			const acknowledgedUpload = await acknowledgePresignedUpload({
				dbClient,
				s3Client: c.get("s3Client"),
				upload: {
					...uploadForKey,
					visibility: uploadForKey.visibility,
				},
				queueProcessing: {
					enabled: false,
				},
			});
			const document = await findDashboardDocumentById(
				c,
				acknowledgedUpload.documentId,
			);

			if (!document) {
				return c.json(
					{
						message:
							"Upload was acknowledged but the document could not be loaded",
					},
					500,
				);
			}

			return c.json({
				...acknowledgedUpload,
				document,
			});
		} catch (error) {
			return toDocumentUploadErrorResponse(
				c,
				error,
				"Failed to acknowledge upload",
			);
		}
	});
}
