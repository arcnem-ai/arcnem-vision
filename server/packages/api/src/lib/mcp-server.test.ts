import { describe, expect, test } from "bun:test";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { S3Client } from "bun";
import { and, eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Inngest } from "inngest";
import { MCP_SCOPES, type McpPrincipal } from "./mcp-auth-plugin";
import { createVisionMcpServer } from "./mcp-server";

const orgA = "019d9996-404c-70eb-9d8e-000000000001";
const orgB = "019d9996-404c-70eb-9d8e-000000000002";
const workflowId = "019d9996-404c-70eb-9d8e-000000000003";
const dialect = new PgDialect();
const sqlParams = (where: SQL) => dialect.sqlToQuery(where).params;

async function withClient<T>(
	db: PGDB,
	principal: McpPrincipal,
	run: (client: Client) => Promise<T>,
) {
	const server = createVisionMcpServer(
		{ db, s3: {} as S3Client, inngest: {} as Inngest },
		principal,
	);
	const client = new Client({ name: "vision-mcp-test", version: "1.0.0" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await server.connect(serverTransport);
	await client.connect(clientTransport);
	try {
		return await run(client);
	} finally {
		await client.close();
		await server.close();
	}
}

describe("Vision MCP tools", () => {
	test("exposes the twelve agreed tools, and read-only tokens cannot call writes", async () => {
		const principal = {
			userId: "reader",
			clientId: "test",
			scopes: [...MCP_SCOPES],
		};
		await withClient({} as PGDB, principal, async (client) => {
			expect(
				(await client.listTools()).tools.map((tool) => tool.name).sort(),
			).toEqual([
				"create_workflow",
				"execute_workflow",
				"get_document",
				"get_execution",
				"get_workflow",
				"get_workflow_catalog",
				"list_documents",
				"list_executions",
				"list_projects",
				"list_workflows",
				"search_documents",
				"update_workflow",
			]);
		});
		await withClient(
			{} as PGDB,
			{ ...principal, scopes: ["workflows:read"] },
			async (client) => {
				expect(
					(await client.listTools()).tools.every(
						(tool) => tool.annotations?.readOnlyHint,
					),
				).toBe(true);
				await expect(
					client.callTool({ name: "execute_workflow", arguments: {} }),
				).rejects.toThrow("not found");
			},
		);
	});

	test("rejects malformed IDs and missing revisions before accessing the database", async () => {
		await withClient(
			{} as PGDB,
			{ userId: "editor", clientId: "test", scopes: [...MCP_SCOPES] },
			async (client) => {
				expect(
					(
						await client.callTool({
							name: "get_workflow",
							arguments: { organizationId: "invalid", workflowId },
						})
					).isError,
				).toBe(true);
				expect(
					(
						await client.callTool({
							name: "update_workflow",
							arguments: { organizationId: orgA, workflowId, definition: {} },
						})
					).isError,
				).toBe(true);
			},
		);
	});

	test("checks current membership for each call and keeps concurrent principals isolated", async () => {
		let revoked = false;
		const db = {
			query: {
				members: {
					findFirst: async ({ where }: { where: SQL }) => {
						const params = sqlParams(where);
						if (
							revoked ||
							(params[0] === "alice" ? params[1] !== orgA : params[1] !== orgB)
						)
							return undefined;
						return { organizationId: params[1] };
					},
				},
				agentGraphs: {
					findFirst: async (input: {
						where: (
							row: typeof schema.agentGraphs,
							operators: { and: typeof and; eq: typeof eq },
						) => SQL;
					}) => {
						const params = sqlParams(
							input.where(schema.agentGraphs, { and, eq }),
						);
						return {
							id: workflowId,
							organizationId: params[1],
							name: String(params[1]),
							description: "",
							entryNode: "worker",
							stateSchema: {},
							archivedAt: null,
							revision: "2026-01-01 00:00:00",
							agentGraphNodes: [],
							agentGraphEdges: [],
						};
					},
				},
			},
		} as unknown as PGDB;
		await Promise.all(
			[
				["alice", orgA, orgB],
				["bob", orgB, orgA],
			].map(async ([userId, ownOrg, otherOrg]) =>
				withClient(
					db,
					{ userId, clientId: "test", scopes: ["workflows:read"] },
					async (client) => {
						const own = await client.callTool({
							name: "get_workflow",
							arguments: { organizationId: ownOrg, workflowId },
						});
						expect(own.isError).not.toBe(true);
						expect(own.structuredContent).toMatchObject({
							organizationId: ownOrg,
						});
						const other = await client.callTool({
							name: "get_workflow",
							arguments: { organizationId: otherOrg, workflowId },
						});
						expect(other.isError).toBe(true);
					},
				),
			),
		);
		revoked = true;
		await withClient(
			db,
			{ userId: "alice", clientId: "test", scopes: ["workflows:read"] },
			async (client) => {
				expect(
					(
						await client.callTool({
							name: "get_workflow",
							arguments: { organizationId: orgA, workflowId },
						})
					).isError,
				).toBe(true);
			},
		);
	});
});
