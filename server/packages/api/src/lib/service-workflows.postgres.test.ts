import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Inngest } from "inngest";
import { MAX_WORKFLOW_EVENT_BYTES } from "@/constants/requests";
import { executeServiceWorkflow } from "./service-workflows";

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

async function seedWorkflow(db: PGDB) {
	const [organization] = await db
		.insert(schema.organizations)
		.values({ name: "Execute Org", slug: randomUUID() })
		.returning();
	const [project] = await db
		.insert(schema.projects)
		.values({
			name: "Execute Project",
			slug: randomUUID(),
			organizationId: organization.id,
		})
		.returning();
	const [workflow] = await db
		.insert(schema.agentGraphs)
		.values({
			name: "Execute Workflow",
			entryNode: "start",
			organizationId: organization.id,
		})
		.returning();
	const [document] = await db
		.insert(schema.documents)
		.values({
			bucket: "test",
			objectKey: `execute/${randomUUID()}.png`,
			contentType: "image/png",
			eTag: randomUUID(),
			sizeBytes: 1,
			lastModifiedAt: new Date(),
			visibility: "org",
			organizationId: organization.id,
			projectId: project.id,
		})
		.returning();
	return { organization, project, workflow, document };
}

describePostgres("executeServiceWorkflow", () => {
	test("rejects input too large for an Inngest event before creating a run", async () => {
		await withRollback(async (db) => {
			const seeded = await seedWorkflow(db);
			const sent: unknown[] = [];
			const inngest = {
				send: async (event: unknown) => {
					sent.push(event);
				},
			} as unknown as Inngest;
			const scope = {
				organizationId: seeded.organization.id,
				projectId: seeded.project.id,
				idempotencyActor: "test",
			};
			const request = (note: string) => ({
				workflowId: seeded.workflow.id,
				documentIds: [seeded.document.id],
				initialState: { note },
			});

			const tooLarge = await executeServiceWorkflow(
				db,
				inngest,
				scope,
				request("x".repeat(MAX_WORKFLOW_EVENT_BYTES)),
			);

			expect(tooLarge.status).toBe(413);
			expect(tooLarge.body).toMatchObject({
				maxBytes: MAX_WORKFLOW_EVENT_BYTES,
			});
			expect(sent).toHaveLength(0);
			expect(
				await db
					.select()
					.from(schema.agentGraphRuns)
					.where(eq(schema.agentGraphRuns.projectId, seeded.project.id)),
			).toHaveLength(0);

			const accepted = await executeServiceWorkflow(
				db,
				inngest,
				scope,
				request("small"),
			);
			expect(accepted.status).toBe(202);
			expect(sent).toHaveLength(1);
		});
	});
});
