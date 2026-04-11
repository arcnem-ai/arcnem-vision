import { Hono } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { registerDashboardDocumentDetailRoutes } from "./dashboardDocuments/details";
import { registerDashboardDocumentListingRoutes } from "./dashboardDocuments/listing";
import { registerDashboardDocumentUploadRoutes } from "./dashboardDocuments/uploads";

export const dashboardDocumentsRouter = new Hono<HonoServerContext>({
	strict: false,
});

registerDashboardDocumentUploadRoutes(dashboardDocumentsRouter);
registerDashboardDocumentDetailRoutes(dashboardDocumentsRouter);
registerDashboardDocumentListingRoutes(dashboardDocumentsRouter);
