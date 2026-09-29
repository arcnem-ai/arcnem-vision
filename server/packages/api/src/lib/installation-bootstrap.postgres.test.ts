import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { schema } from "@arcnem-vision/db";
import { CATALOG_MODELS, CATALOG_TOOLS } from "@arcnem-vision/db/catalog";
import type { PGDB } from "@arcnem-vision/db/server";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { bootstrapInstallation } from "./installation-bootstrap";
import { getWorkflow } from "./workflow-operations";

// TEST_DATABASE_URL enables this check against a migrated PostgreSQL database.
// Every test runs in a transaction that is rolled back.
const databaseURL = process.env.TEST_DATABASE_URL;
const describePostgres = databaseURL ? describe : describe.skip;

async function withRollback(fn: (db: PGDB) => Promise<void>) {
	const db = drizzle({
		connection: { connectionString: databaseURL },
		casing: "snake_case",
		schema,
	}) as PGDB;
	try {
		await db.transaction(async (tx) => {
			await fn(tx as unknown as PGDB);
			tx.rollback();
		});
	} catch (error) {
		if (!(error instanceof TransactionRollbackError)) throw error;
	} finally {
		await db.$client.end();
	}
}

describePostgres("bootstrapInstallation", () => {
	test("sets up an owner, organization, project and starter workflow once", async () => {
		await withRollback(async (db) => {
			const ownerEmail = `Owner-${randomUUID()}@Example.test`;
			const input = { ownerEmail, organizationName: "Acme Vision" };

			const first = await bootstrapInstallation(db, input);
			expect(first.ownerCreated).toBe(true);
			expect(first.organizationCreated).toBe(true);
			expect(first.organizationId).toBeString();
			expect(first.starterWorkflowId).toBeString();

			const owner = await db.query.users.findFirst({
				where: (row, { eq }) => eq(row.email, ownerEmail.toLowerCase()),
			});
			expect(owner?.emailVerified).toBe(true);
			const membership = await db.query.members.findFirst({
				where: (row, { eq }) => eq(row.userId, owner?.id ?? ""),
			});
			expect(membership).toMatchObject({
				organizationId: first.organizationId,
				role: "owner",
			});
			const projects = await db
				.select()
				.from(schema.projects)
				.where(
					eq(schema.projects.organizationId, first.organizationId as string),
				);
			expect(projects.map((project) => project.name)).toEqual([
				"Default Project",
			]);

			const starter = await getWorkflow(
				db,
				first.organizationId as string,
				first.starterWorkflowId as string,
			);
			expect(starter.definition.nodes.map((node) => node.nodeKey)).toEqual([
				"describe",
				"save_description",
				"embed_document",
				"embed_description",
			]);

			const second = await bootstrapInstallation(db, input);
			expect(second).toEqual({
				ownerCreated: false,
				organizationCreated: false,
				organizationId: first.organizationId,
				starterWorkflowId: null,
			});
			const organizationWorkflows = await db
				.select()
				.from(schema.agentGraphs)
				.where(
					eq(schema.agentGraphs.organizationId, first.organizationId as string),
				);
			expect(organizationWorkflows).toHaveLength(1);
		});
	});

	test("gives an existing account without an organization one", async () => {
		await withRollback(async (db) => {
			const ownerEmail = `owner-${randomUUID()}@example.test`;
			const [user] = await db
				.insert(schema.users)
				.values({ name: "Owner", email: ownerEmail, emailVerified: true })
				.returning({ id: schema.users.id });

			const result = await bootstrapInstallation(db, {
				ownerEmail,
				organizationName: "Acme Vision",
			});
			expect(result.ownerCreated).toBe(false);
			expect(result.organizationCreated).toBe(true);
			expect(result.starterWorkflowId).toBeString();
			const membership = await db.query.members.findFirst({
				where: (row, { eq }) => eq(row.userId, user?.id ?? ""),
			});
			expect(membership).toMatchObject({
				organizationId: result.organizationId,
				role: "owner",
			});
		});
	});

	test("does not bring back an archived starter workflow", async () => {
		await withRollback(async (db) => {
			const input = {
				ownerEmail: `owner-${randomUUID()}@example.test`,
				organizationName: "Acme Vision",
			};
			const first = await bootstrapInstallation(db, input);
			await db
				.update(schema.agentGraphs)
				.set({ archivedAt: new Date() })
				.where(eq(schema.agentGraphs.id, first.starterWorkflowId as string));

			const second = await bootstrapInstallation(db, input);
			expect(second.starterWorkflowId).toBeNull();
		});
	});

	test("installs every catalog model and tool without duplicating them", async () => {
		await withRollback(async (db) => {
			const input = {
				ownerEmail: `${randomUUID()}@example.test`,
				organizationName: "Catalog Check",
			};
			await bootstrapInstallation(db, input);
			await bootstrapInstallation(db, input);
			for (const model of Object.values(CATALOG_MODELS)) {
				const rows = await db
					.select()
					.from(schema.models)
					.where(eq(schema.models.name, model.name));
				expect(rows).toHaveLength(1);
			}
			for (const tool of Object.values(CATALOG_TOOLS)) {
				const rows = await db
					.select()
					.from(schema.tools)
					.where(eq(schema.tools.name, tool.name));
				expect(rows).toHaveLength(1);
			}
		});
	});
});
