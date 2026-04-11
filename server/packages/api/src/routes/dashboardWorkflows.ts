import { Hono } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { dashboardWorkflowTemplatesRouter } from "./dashboardWorkflows/templates";
import { dashboardWorkflowRecordsRouter } from "./dashboardWorkflows/workflows";

export const dashboardWorkflowsRouter = new Hono<HonoServerContext>({
	strict: false,
});

[dashboardWorkflowRecordsRouter, dashboardWorkflowTemplatesRouter].forEach(
	(route) => {
		dashboardWorkflowsRouter.route("/", route);
	},
);
