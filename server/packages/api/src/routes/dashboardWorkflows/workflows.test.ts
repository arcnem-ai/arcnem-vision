import { expect, test } from "bun:test";
import { Hono } from "hono";
import { dashboardWorkflowRecordsRouter } from "./workflows";

const organizationId = "019f0400-0000-7000-8000-000000000001";
const workflowId = "019f0400-0000-7000-8000-000000000002";
const modelId = "019f0400-0000-7000-8000-000000000003";
const definition = {
	name: "Experiment",
	description: "",
	entryNode: "review",
	nodes: [
		{ nodeKey: "review", nodeType: "worker", modelId, x: 0, y: 0, config: {} },
	],
	edges: [{ fromNode: "review", toNode: "END" }],
};

function requestWorkflow(path: string, body: object, failDatabase = false) {
	const db = {
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: async () => [
						{ organizationId, name: "Test", slug: "test", role: "owner" },
					],
				}),
				where: () => ({
					for: async () => {
						if (failDatabase) throw new Error("private database failure");
						return [{ id: workflowId, revision: "2026-09-09 12:00:00.123456" }];
					},
				}),
			}),
		}),
		query: {
			members: { findFirst: async () => ({ id: "member" }) },
			models: {
				findMany: async () => [
					{ id: modelId, provider: "OPENAI", name: "test", type: "chat" },
				],
			},
			tools: { findMany: async () => [] },
		},
		transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> =>
			callback(db),
	};
	const variables = {
		session: {
			id: "session",
			userId: "user",
			activeOrganizationId: organizationId,
		},
		user: { id: "user", email: "test@example.com" },
		dbClient: db,
	};
	const app = new Hono<{ Variables: typeof variables }>();
	app.use("*", async (c, next) => {
		c.set("session", variables.session);
		c.set("user", variables.user);
		c.set("dbClient", variables.dbClient);
		await next();
	});
	app.route("/api", dashboardWorkflowRecordsRouter);
	return app.request(`/api/dashboard/workflows${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

test("dashboard workflow update returns the stale revision conflict", async () => {
	const response = await requestWorkflow("/update", {
		...definition,
		workflowId,
		expectedRevision: "2026-09-09 12:00:00.123000",
	});
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({
		message: expect.stringContaining("Workflow changed since it was read"),
	});
});

test("dashboard workflow creation returns business validation errors", async () => {
	const response = await requestWorkflow("", { ...definition, name: "x" });
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		message: "Workflow name must be at least 2 characters.",
	});
});

test("dashboard workflow creation returns node configuration validation errors", async () => {
	const response = await requestWorkflow("", {
		...definition,
		nodes: [
			{ ...definition.nodes[0], config: { reasoning_effort: "invalid" } },
		],
	});
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({
		message: expect.stringContaining("Invalid option"),
	});
});

test("unexpected workflow failures remain generic server errors", async () => {
	const response = await requestWorkflow(
		"/update",
		{ ...definition, workflowId },
		true,
	);
	expect(response.status).toBe(500);
	expect(await response.text()).toBe("Internal Server Error");
});
