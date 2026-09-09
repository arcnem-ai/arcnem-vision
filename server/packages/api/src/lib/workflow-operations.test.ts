import { describe, expect, test } from "bun:test";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { and, eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	createWorkflow,
	getWorkflow,
	getWorkflowCatalog,
	updateWorkflow,
} from "./workflow-operations";

const organizationId = "019f0400-0000-7000-8000-000000000001";
const workflowId = "019f0400-0000-7000-8000-000000000002";
const modelId = "019f0400-0000-7000-8000-000000000003";
const access = { userId: "user-1", organizationId };
const definition = {
	name: "Experiment",
	description: "",
	entryNode: "review",
	stateSchema: { result: "overwrite" as const },
	nodes: [
		{
			nodeKey: "review",
			nodeType: "worker",
			modelId,
			x: 80,
			y: 80,
			config: { system_message: "Review the document." },
		},
	],
	edges: [{ fromNode: "review", toNode: "END" }],
};
const oldRevision = "2026-09-09 12:00:00.123456";

function database({ member = true, revision = oldRevision } = {}) {
	let writes = 0;
	let lock: string | undefined;
	let updatedValues: Record<string, unknown> = {};
	const dialect = new PgDialect();
	const scoped = (where: SQL) => {
		const params = dialect.sqlToQuery(where).params;
		return params.includes(organizationId) && params.includes(workflowId);
	};
	const record = {
		id: workflowId,
		organizationId,
		revision,
		...definition,
		archivedAt: null,
		agentGraphNodes: [
			{
				...definition.nodes[0],
				id: "node-1",
				inputKey: null,
				outputKey: null,
				config: {
					...definition.nodes[0].config,
					uiPosition: { x: 123, y: 456 },
				},
				agentGraphNodeTools: [],
			},
		],
		agentGraphEdges: definition.edges,
	};
	const db = {
		query: {
			members: {
				findFirst: async () => (member ? { id: "member-1" } : undefined),
			},
			models: {
				findMany: async () => [
					{
						id: modelId,
						provider: "OPENAI",
						name: "test-model",
						version: null,
						type: "chat",
					},
				],
			},
			tools: { findMany: async () => [] },
			agentGraphs: {
				findFirst: async (input: {
					where: (
						row: typeof schema.agentGraphs,
						operators: { and: typeof and; eq: typeof eq },
					) => SQL;
				}) =>
					scoped(input.where(schema.agentGraphs, { and, eq }))
						? record
						: undefined,
			},
			agentGraphNodes: { findMany: async () => [] },
		},
		select: () => ({
			from: () => ({
				where: (where: SQL) => ({
					for: async (mode: string) => {
						lock = mode;
						return scoped(where) ? [record] : [];
					},
				}),
			}),
		}),
		insert: () => ({
			values: () => {
				writes++;
				return {
					returning: async () => [
						{ id: workflowId, nodeKey: "review", revision },
					],
				};
			},
		}),
		delete: () => ({
			where: async () => {
				writes++;
			},
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => {
				updatedValues = values;
				writes++;
				return {
					where: () => ({
						returning: async () => [
							{ id: workflowId, revision: "2026-09-09 12:00:00.123457" },
						],
					}),
				};
			},
		}),
		transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
			callback(db),
	};
	return {
		db: db as unknown as PGDB,
		writes: () => writes,
		lock: () => lock,
		updatedValues: () => updatedValues,
	};
}

describe("workflow operations", () => {
	test("locks the scoped graph before rejecting a stale microsecond revision without writes", async () => {
		const fake = database();
		await expect(
			updateWorkflow(fake.db, access, {
				...definition,
				workflowId,
				expectedRevision: "2026-09-09 12:00:00.123000",
			}),
		).rejects.toMatchObject({ status: 409 });
		expect(fake.lock()).toBe("update");
		expect(fake.writes()).toBe(0);
	});

	test("rejects cross-organization reads and updates even for another valid member", async () => {
		const fake = database();
		await expect(
			getWorkflow(fake.db, "other-organization", workflowId),
		).rejects.toMatchObject({ status: 404 });
		await expect(
			updateWorkflow(
				fake.db,
				{ ...access, organizationId: "other-organization" },
				{ ...definition, workflowId, expectedRevision: oldRevision },
			),
		).rejects.toMatchObject({ status: 404 });
		expect(fake.writes()).toBe(0);
	});

	test("requires current membership before creating or changing a workflow", async () => {
		const fake = database({ member: false });
		await expect(
			createWorkflow(fake.db, access, definition),
		).rejects.toMatchObject({ status: 403 });
		await expect(
			updateWorkflow(fake.db, access, { ...definition, workflowId }),
		).rejects.toMatchObject({ status: 403 });
		expect(fake.writes()).toBe(0);
	});

	test("validates runtime configuration and catalog references before writes", async () => {
		const fake = database();
		await expect(
			createWorkflow(fake.db, access, {
				...definition,
				nodes: [
					{ ...definition.nodes[0], config: { reasoning_effort: "invalid" } },
				],
			}),
		).rejects.toThrow();
		await expect(
			createWorkflow(fake.db, access, {
				...definition,
				nodes: [{ ...definition.nodes[0], modelId: "unknown-model" }],
			}),
		).rejects.toMatchObject({ status: 400 });
		await expect(
			createWorkflow(fake.db, access, {
				...definition,
				stateSchema: { result: "sum" },
			} as never),
		).rejects.toThrow();
		await expect(
			createWorkflow(fake.db, access, { ...definition, entryNode: "missing" }),
		).rejects.toMatchObject({
			status: 400,
			message: 'Entry node "missing" does not exist.',
		});
		await expect(
			updateWorkflow(fake.db, access, {
				...definition,
				workflowId,
				entryNode: "missing",
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(fake.writes()).toBe(0);
	});

	test("round-trips the complete definition and keeps the stored canvas position", async () => {
		const fake = database();
		const workflow = await getWorkflow(fake.db, organizationId, workflowId);
		expect(workflow.revision).toBe(oldRevision);
		expect(workflow.definition.stateSchema).toEqual(definition.stateSchema);
		expect(workflow.definition.nodes[0]).toMatchObject({
			x: 123,
			y: 456,
			config: definition.nodes[0].config,
		});
		expect(workflow.definition.nodes[0]?.config).not.toHaveProperty(
			"uiPosition",
		);
		await expect(
			createWorkflow(fake.db, access, workflow.definition),
		).resolves.toMatchObject({ id: workflowId });
	});

	test("updates the revision and state schema while preserving omitted dashboard state schema", async () => {
		const fake = database();
		const result = await updateWorkflow(fake.db, access, {
			...definition,
			workflowId,
			expectedRevision: oldRevision,
		});
		expect(result.revision).not.toBe(oldRevision);
		expect(fake.updatedValues().stateSchema).toEqual(definition.stateSchema);
		const sql = new PgDialect().sqlToQuery(
			fake.updatedValues().updatedAt as SQL,
		).sql;
		expect(sql).toContain("greatest(clock_timestamp()");
		expect(sql).toContain("1 microsecond");
		await updateWorkflow(fake.db, access, {
			...definition,
			stateSchema: undefined,
			workflowId,
		});
		expect(fake.updatedValues()).not.toHaveProperty("stateSchema");
	});

	test("catalog exposes model IDs and node configuration schemas", async () => {
		const catalog = await getWorkflowCatalog(database().db);
		expect(catalog.models[0]?.id).toBe(modelId);
		expect(catalog.nodeTypes.map((node) => node.nodeType)).toEqual([
			"worker",
			"supervisor",
			"condition",
			"tool",
		]);
		expect(catalog.nodeTypes[0]?.configSchema).toHaveProperty(
			"properties.reasoning_effort",
		);
	});
});
