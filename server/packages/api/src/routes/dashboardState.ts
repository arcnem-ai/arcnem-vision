import { getDashboardStateQuerySchema } from "@arcnem-vision/shared";
import { Hono } from "hono";
import { buildDashboardState } from "@/lib/dashboard-state/build-state";
import { readValidatedInput } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardStateRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardStateRouter.get("/dashboard/state", async (c) => {
	const parsed = readValidatedInput(getDashboardStateQuerySchema, {
		includeArchived: c.req.query("includeArchived") === "true",
	});
	if (!parsed.ok) {
		return c.json({ message: parsed.message }, 400);
	}

	return c.json(
		await buildDashboardState(c, parsed.data.includeArchived === true),
	);
});
