import { agentGraphRuns, agentGraphs } from "@arcnem-vision/db/schema";
import { getRunsQuerySchema } from "@arcnem-vision/shared";
import { and, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { readValidatedInput } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

const PAGE_SIZE = 20;

export const dashboardRunsRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardRunsRouter.get("/dashboard/runs", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const parsed = readValidatedInput(getRunsQuerySchema, {
		cursor: c.req.query("cursor") ?? undefined,
		limit: c.req.query("limit")
			? Number.parseInt(c.req.query("limit") ?? "", 10)
			: undefined,
	});
	if (!parsed.ok) {
		return c.json({ message: parsed.message }, 400);
	}

	const db = c.get("dbClient");
	const limit = parsed.data.limit ?? PAGE_SIZE;
	const conditions = [
		eq(agentGraphs.organizationId, access.context.organizationId),
	];
	if (parsed.data.cursor) {
		conditions.push(lt(agentGraphRuns.id, parsed.data.cursor));
	}

	const rows = await db
		.select({
			id: agentGraphRuns.id,
			agentGraphId: agentGraphRuns.agentGraphId,
			status: agentGraphRuns.status,
			error: agentGraphRuns.error,
			startedAt: agentGraphRuns.startedAt,
			finishedAt: agentGraphRuns.finishedAt,
			workflowName: agentGraphs.name,
		})
		.from(agentGraphRuns)
		.innerJoin(agentGraphs, eq(agentGraphRuns.agentGraphId, agentGraphs.id))
		.where(and(...conditions))
		.orderBy(desc(agentGraphRuns.startedAt))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const pageRows = hasMore ? rows.slice(0, limit) : rows;

	return c.json({
		runs: pageRows.map((row) => ({
			id: row.id,
			agentGraphId: row.agentGraphId,
			workflowName: row.workflowName,
			status: row.status,
			error: row.error,
			startedAt: new Date(row.startedAt).toISOString(),
			finishedAt: row.finishedAt
				? new Date(row.finishedAt).toISOString()
				: null,
		})),
		nextCursor: hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null,
	});
});

dashboardRunsRouter.get("/dashboard/runs/:id", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const db = c.get("dbClient");
	const [row] = await db
		.select({
			id: agentGraphRuns.id,
			agentGraphId: agentGraphRuns.agentGraphId,
			status: agentGraphRuns.status,
			error: agentGraphRuns.error,
			startedAt: agentGraphRuns.startedAt,
			finishedAt: agentGraphRuns.finishedAt,
			workflowName: agentGraphs.name,
		})
		.from(agentGraphRuns)
		.innerJoin(agentGraphs, eq(agentGraphRuns.agentGraphId, agentGraphs.id))
		.where(
			and(
				eq(agentGraphRuns.id, c.req.param("id")),
				eq(agentGraphs.organizationId, access.context.organizationId),
			),
		)
		.limit(1);

	if (!row) {
		return c.json(null);
	}

	return c.json({
		id: row.id,
		agentGraphId: row.agentGraphId,
		workflowName: row.workflowName,
		status: row.status,
		error: row.error,
		startedAt: new Date(row.startedAt).toISOString(),
		finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
	});
});

dashboardRunsRouter.get("/dashboard/runs/:id/steps", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const db = c.get("dbClient");
	const [run] = await db
		.select({
			initialState: agentGraphRuns.initialState,
			finalState: agentGraphRuns.finalState,
			error: agentGraphRuns.error,
		})
		.from(agentGraphRuns)
		.innerJoin(agentGraphs, eq(agentGraphRuns.agentGraphId, agentGraphs.id))
		.where(
			and(
				eq(agentGraphRuns.id, c.req.param("id")),
				eq(agentGraphs.organizationId, access.context.organizationId),
			),
		)
		.limit(1);

	if (!run) {
		return c.json({
			steps: [],
			initialState: null,
			finalState: null,
			error: null,
		});
	}

	const steps = await db.query.agentGraphRunSteps.findMany({
		where: (row, { eq }) => eq(row.runId, c.req.param("id")),
		orderBy: (row, { asc }) => [asc(row.stepOrder)],
	});

	return c.json({
		steps: steps.map((step) => ({
			id: step.id,
			nodeKey: step.nodeKey,
			stepOrder: step.stepOrder,
			stateDelta: step.stateDelta,
			startedAt: new Date(step.startedAt).toISOString(),
			finishedAt: step.finishedAt
				? new Date(step.finishedAt).toISOString()
				: null,
		})),
		initialState: run.initialState,
		finalState: run.finalState,
		error: run.error,
	});
});
