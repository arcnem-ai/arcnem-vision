import { Hono } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { dashboardChatRouter } from "./dashboardChat";
import { dashboardOrganizationsRouter } from "./dashboardOrganizations";
import { dashboardProjectsRouter } from "./dashboardProjects";
import { dashboardRealtimeRouter } from "./dashboardRealtime";
import { dashboardRunsRouter } from "./dashboardRuns";
import { dashboardStateRouter } from "./dashboardState";
import { dashboardWebhooksRouter } from "./dashboardWebhooks";
import { dashboardWorkflowsRouter } from "./dashboardWorkflows";

export const dashboardRouter = new Hono<HonoServerContext>({
	strict: false,
});

[
	dashboardStateRouter,
	dashboardRunsRouter,
	dashboardOrganizationsRouter,
	dashboardProjectsRouter,
	dashboardWebhooksRouter,
	dashboardWorkflowsRouter,
	dashboardChatRouter,
	dashboardRealtimeRouter,
].forEach((route) => {
	dashboardRouter.route("/", route);
});
