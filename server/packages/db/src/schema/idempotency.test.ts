import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { agentGraphRuns } from "./agentGraphSchemas";
import { presignedUploads } from "./projectSchema";

function idempotencyIndexColumns(table: PgTable) {
	const index = getTableConfig(table).indexes.find((candidate) =>
		candidate.config.name?.endsWith("api_key_idempotency_key_uidx"),
	);
	return {
		unique: index?.config.unique,
		partial: Boolean(index?.config.where),
		columns: index?.config.columns.map((column) =>
			"name" in column ? column.name : undefined,
		),
	};
}

describe("service idempotency schema", () => {
	test("scopes upload and workflow keys to the verified API key", () => {
		for (const table of [presignedUploads, agentGraphRuns]) {
			expect(idempotencyIndexColumns(table)).toEqual({
				unique: true,
				partial: true,
				columns: ["api_key_id", "idempotency_key"],
			});
		}
	});
});

test("OAuth run history survives project deletion without weakening actor checks", () => {
	const db = new Database(":memory:");
	try {
		const constraint = getTableConfig(agentGraphRuns).checks.find(
			(check) => check.name === "agent_graph_runs_idempotency_fields_together",
		);
		if (!constraint) throw new Error("Missing idempotency constraint");
		const check = new PgDialect().sqlToQuery(constraint.value).sql;
		db.exec(`
			PRAGMA foreign_keys = ON;
			CREATE TABLE projects (id TEXT PRIMARY KEY);
			CREATE TABLE agent_graph_runs (
				id TEXT PRIMARY KEY,
				project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
				api_key_id TEXT,
				idempotency_actor TEXT,
				idempotency_key TEXT,
				idempotency_request_hash TEXT,
				idempotency_response TEXT,
				CHECK (${check})
			);
			INSERT INTO projects VALUES ('project');
			INSERT INTO agent_graph_runs VALUES
				('run', 'project', NULL, 'oauth-actor', 'retry', 'hash', '{}');
			DELETE FROM projects WHERE id = 'project';
		`);
		expect(
			db
				.query(
					"SELECT project_id, idempotency_actor, idempotency_key FROM agent_graph_runs",
				)
				.get(),
		).toEqual({
			project_id: null,
			idempotency_actor: "oauth-actor",
			idempotency_key: "retry",
		});
		expect(() =>
			db.exec("UPDATE agent_graph_runs SET idempotency_actor = NULL"),
		).toThrow();
		expect(() =>
			db.exec("UPDATE agent_graph_runs SET api_key_id = 'key'"),
		).toThrow();
	} finally {
		db.close();
	}
});
