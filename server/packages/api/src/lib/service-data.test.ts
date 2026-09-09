import { Database, type SQLQueryBindings } from "bun:sqlite";
import { expect, test } from "bun:test";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { listServiceExecutions } from "./service-data";

test("execution history paginates mixed UUIDs by exact time, breaks ties, and scopes cursors", async () => {
	const sqlite = new Database(":memory:");
	try {
		sqlite.exec(`
			CREATE TABLE agent_graphs (id TEXT PRIMARY KEY, organization_id TEXT, name TEXT);
			CREATE TABLE agent_graph_runs (
				id TEXT PRIMARY KEY, agent_graph_id TEXT, project_id TEXT,
				status TEXT DEFAULT 'completed', started_at TEXT,
				finished_at TEXT, graph_snapshot_hash TEXT
			);
			INSERT INTO agent_graphs VALUES
				('workflow', 'org', 'Workflow'),
				('other-workflow', 'org', 'Other workflow'),
				('foreign-workflow', 'foreign-org', 'Foreign workflow');
		`);
		const newest = "019f0000-0000-7000-8000-000000000002";
		const sameTimeHighId = "f0000000-0000-4000-8000-000000000001";
		const sameTimeLowId = "019f0000-0000-7000-8000-000000000001";
		const previousMicrosecond = "e0000000-0000-4000-8000-000000000001";
		const oldest = "d0000000-0000-4000-8000-000000000001";
		const insert = sqlite.prepare(
			"INSERT INTO agent_graph_runs (id, agent_graph_id, project_id, started_at) VALUES (?, ?, ?, ?)",
		);
		for (const [id, time] of [
			[newest, "2026-09-09 12:00:00.123457"],
			[sameTimeHighId, "2026-09-09 12:00:00.123456"],
			[sameTimeLowId, "2026-09-09 12:00:00.123456"],
			[previousMicrosecond, "2026-09-09 12:00:00.123455"],
			[oldest, "2025-01-01 00:00:00.000000"],
		]) {
			insert.run(id, "workflow", "project", time);
		}
		for (const [id, workflow, project] of [
			["other-workflow-run", "other-workflow", "project"],
			["foreign-org-run", "foreign-workflow", "project"],
			["foreign-project-run", "workflow", "foreign-project"],
		]) {
			insert.run(id, workflow, project, "2026-09-10 00:00:00.000000");
		}
		// Execute the real PostgreSQL SELECT against in-memory rows; fixed-width
		// timestamp strings preserve its ordering and microsecond boundaries.
		const db = drizzle({
			schema,
			client: {
				async query({ text }: { text: string }, params: SQLQueryBindings[]) {
					return { rows: sqlite.query(text).values(...params) };
				},
			} as unknown as PGDB["$client"],
		});
		const scope = { organizationId: "org", projectId: "project" };
		const first = await listServiceExecutions(db, scope, {
			workflowId: "workflow",
			limit: 2,
		});
		expect(first.executions.map((run) => run.executionId)).toEqual([
			newest,
			sameTimeHighId,
		]);
		expect(first.nextCursor).toBe(sameTimeHighId);
		const second = await listServiceExecutions(db, scope, {
			workflowId: "workflow",
			limit: 2,
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.executions.map((run) => run.executionId)).toEqual([
			sameTimeLowId,
			previousMicrosecond,
		]);
		expect(second.nextCursor).toBe(previousMicrosecond);
		const last = await listServiceExecutions(db, scope, {
			workflowId: "workflow",
			limit: 2,
			cursor: second.nextCursor ?? undefined,
		});
		expect(last.executions.map((run) => run.executionId)).toEqual([oldest]);
		expect(last.nextCursor).toBeNull();
		for (const cursor of [
			"missing-run",
			"foreign-org-run",
			"foreign-project-run",
			"other-workflow-run",
		]) {
			expect(
				await listServiceExecutions(db, scope, {
					workflowId: "workflow",
					cursor,
				}),
			).toEqual({ executions: [], nextCursor: null });
		}
		const unfiltered = await listServiceExecutions(db, scope, {});
		expect(unfiltered.executions.map((run) => run.executionId)).toEqual([
			"other-workflow-run",
			newest,
			sameTimeHighId,
			sameTimeLowId,
			previousMicrosecond,
			oldest,
		]);
	} finally {
		sqlite.close();
	}
});
