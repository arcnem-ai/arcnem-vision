import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { findSimilarKeyDocuments } from "./document-api";

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

async function seedSimilarity(db: PGDB) {
	const [user] = await db
		.insert(schema.users)
		.values({ name: "Similar Test", email: `${randomUUID()}@example.test` })
		.returning();
	const [organization] = await db
		.insert(schema.organizations)
		.values({ name: "Similar Org", slug: randomUUID() })
		.returning();
	const newProject = async () => {
		const [project] = await db
			.insert(schema.projects)
			.values({
				name: "Similar Project",
				slug: randomUUID(),
				organizationId: organization.id,
			})
			.returning();
		return project;
	};
	const project = await newProject();
	const otherProject = await newProject();
	const newKey = async (projectId: string) => {
		const [key] = await db
			.insert(schema.apikeys)
			.values({
				key: randomUUID(),
				userId: user.id,
				organizationId: organization.id,
				projectId,
				kind: "workflow",
			})
			.returning();
		return key;
	};
	const ownKey = await newKey(project.id);
	const sameProjectKey = await newKey(project.id);
	const otherProjectKey = await newKey(otherProject.id);

	const newModel = async (type: string) => {
		const [model] = await db
			.insert(schema.models)
			.values({ provider: "test", name: randomUUID(), type })
			.returning();
		return model;
	};
	const describer = await newModel("description");
	const secondDescriber = await newModel("description");
	const embedder = await newModel("embedding");
	const otherEmbedder = await newModel("embedding");

	const newDocument = async (
		key: typeof ownKey,
		visibility: string,
		descriptions: { model: string; embedding: number[]; embedder?: string }[],
	) => {
		const [document] = await db
			.insert(schema.documents)
			.values({
				bucket: "test",
				objectKey: `similar/${randomUUID()}.png`,
				contentType: "image/png",
				eTag: randomUUID(),
				sizeBytes: 1,
				lastModifiedAt: new Date(),
				visibility,
				organizationId: organization.id,
				projectId: key.projectId as string,
				apiKeyId: key.id,
			})
			.returning();
		for (const description of descriptions) {
			const [row] = await db
				.insert(schema.documentDescriptions)
				.values({
					documentId: document.id,
					modelId: description.model,
					text: `description of ${document.id}`,
				})
				.returning();
			await db.insert(schema.documentDescriptionEmbeddings).values({
				documentDescriptionId: row.id,
				modelId: description.embedder ?? embedder.id,
				embeddingDim: description.embedding.length,
				embedding: description.embedding,
			});
		}
		return document;
	};

	const source = await newDocument(ownKey, "org", [
		{ model: describer.id, embedding: [1, 0, 0] },
	]);
	const near = await newDocument(ownKey, "org", [
		{ model: describer.id, embedding: [0.9, 0.1, 0] },
	]);
	// Two descriptions give two embeddings; the document must appear once.
	const farTwice = await newDocument(ownKey, "private", [
		{ model: describer.id, embedding: [0, 1, 0] },
		{ model: secondDescriber.id, embedding: [0.5, 0.5, 0] },
	]);
	const otherModelOnly = await newDocument(ownKey, "org", [
		{ model: describer.id, embedding: [1, 0, 0], embedder: otherEmbedder.id },
	]);
	const sameProjectPrivate = await newDocument(sameProjectKey, "private", [
		{ model: describer.id, embedding: [1, 0, 0] },
	]);
	const otherProjectPrivate = await newDocument(otherProjectKey, "private", [
		{ model: describer.id, embedding: [1, 0, 0] },
	]);

	return {
		ownKey,
		source,
		near,
		farTwice,
		otherModelOnly,
		sameProjectPrivate,
		otherProjectPrivate,
	};
}

describePostgres("findSimilarKeyDocuments", () => {
	test("returns only the key's own documents, once each, closest first", async () => {
		await withRollback(async (db) => {
			const seeded = await seedSimilarity(db);

			const matches = await findSimilarKeyDocuments(db, {
				documentId: seeded.source.id,
				apiKeyId: seeded.ownKey.id,
				limit: 20,
			});

			expect(matches.map((match) => match.id)).toEqual([
				seeded.near.id,
				seeded.farTwice.id,
			]);
			expect(
				matches.every((match) => match.apiKeyId === seeded.ownKey.id),
			).toBe(true);
			// farTwice is reported at its closer embedding, [0.5, 0.5, 0].
			expect(Number(matches[1]?.distance)).toBeCloseTo(1 - Math.SQRT1_2, 5);
		});
	});

	test("applies the limit after ordering", async () => {
		await withRollback(async (db) => {
			const seeded = await seedSimilarity(db);

			const matches = await findSimilarKeyDocuments(db, {
				documentId: seeded.source.id,
				apiKeyId: seeded.ownKey.id,
				limit: 1,
			});

			expect(matches.map((match) => match.id)).toEqual([seeded.near.id]);
		});
	});
});
