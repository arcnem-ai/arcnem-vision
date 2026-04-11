import type { Hono } from "hono";
import {
	listDashboardDocumentPage,
	resolveDashboardOrganizationId,
	searchDashboardDocumentsByMeaning,
	toDocumentItem,
} from "@/lib/dashboard-documents";
import { requireSession } from "@/middleware/requireSession";
import type { HonoServerContext } from "@/types/serverContext";

export function registerDashboardDocumentListingRoutes(
	router: Hono<HonoServerContext>,
) {
	router.get("/dashboard/documents", requireSession, async (c) => {
		const requestedOrganizationId = c.req.query("organizationId") ?? "";
		const dbClient = c.get("dbClient");
		const organizationResolution = await resolveDashboardOrganizationId(
			c,
			requestedOrganizationId,
		);
		if ("message" in organizationResolution) {
			return c.json(
				{ message: organizationResolution.message },
				organizationResolution.status,
			);
		}
		const { organizationId } = organizationResolution;

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
			const docs = searchRows.map((row) =>
				toDocumentItem(row, c.get("s3Client")),
			);

			return c.json({ documents: docs, nextCursor: null });
		}

		const page = await listDashboardDocumentPage(dbClient, {
			organizationId,
			projectId: projectId || undefined,
			deviceId: deviceId || undefined,
			dashboardUploadsOnly,
			cursor: cursor || undefined,
			limit,
		});

		const docs = page.rows.map((row) => toDocumentItem(row, c.get("s3Client")));

		return c.json({ documents: docs, nextCursor: page.nextCursor });
	});
}
