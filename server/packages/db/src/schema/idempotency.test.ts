import { describe, expect, test } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
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
