import { agentGraphRuns, agentGraphs } from "@arcnem-vision/db/schema";
import { getDB } from "@arcnem-vision/db/server";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, lt } from "drizzle-orm";
import {
	getSessionContext,
	requireOrganizationContext,
} from "@/features/dashboard/server/session-context";
import type { RunStepsResponse, RunsResponse } from "@/features/runs/types";

const PAGE_SIZE = 20;

export const getAgentGraphRuns = createServerFn({ method: "GET" })
	.inputValidator(
		(input: { organizationId: string; cursor?: string; limit?: number }) =>
			input,
	)
	.handler(async ({ data }): Promise<RunsResponse> => {
		const db = getDB();
		const context = await getSessionContext();
		if (!context.session || !context.organizationId) {
			return { runs: [], nextCursor: null };
		}

		const limit = data.limit ?? PAGE_SIZE;

		const conditions = [eq(agentGraphs.organizationId, data.organizationId)];
		if (data.cursor) {
			conditions.push(lt(agentGraphRuns.id, data.cursor));
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

		return {
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
		};
	});

export const getAgentGraphRunSteps = createServerFn({ method: "GET" })
	.inputValidator((input: { runId: string }) => input)
	.handler(async ({ data }): Promise<RunStepsResponse> => {
		const db = getDB();
		await requireOrganizationContext();

		const run = await db.query.agentGraphRuns.findFirst({
			where: (row, { eq }) => eq(row.id, data.runId),
			columns: {
				initialState: true,
				finalState: true,
				error: true,
			},
		});

		if (!run) {
			return { steps: [], initialState: null, finalState: null, error: null };
		}

		const steps = await db.query.agentGraphRunSteps.findMany({
			where: (row, { eq }) => eq(row.runId, data.runId),
			orderBy: (row, { asc }) => [asc(row.stepOrder)],
		});

		return {
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
		};
	});
