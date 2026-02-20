/**
 * Custom migration runner that bypasses drizzle-kit's broken dynamic import resolution.
 * Reads the migration journal and applies pending SQL migrations directly using pg.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "src/db/migrations");
const JOURNAL_PATH = join(MIGRATIONS_DIR, "meta/_journal.json");

interface JournalEntry {
	idx: number;
	version: string;
	when: number;
	tag: string;
	breakpoints: boolean;
}

interface Journal {
	version: string;
	dialect: string;
	entries: JournalEntry[];
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("DATABASE_URL environment variable is required");
		process.exit(1);
	}

	const client = new Client({ connectionString: databaseUrl });

	try {
		await client.connect();
		console.log("Connected to database");

		// Create migrations tracking table if it doesn't exist
		await client.query(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);

		// Get applied migrations
		const { rows: appliedMigrations } = await client.query<{ hash: string }>(
			"SELECT hash FROM __drizzle_migrations ORDER BY id",
		);
		const appliedHashes = new Set(appliedMigrations.map((m) => m.hash));

		// Read journal
		const journalContent = await readFile(JOURNAL_PATH, "utf-8");
		const journal: Journal = JSON.parse(journalContent);

		// Apply pending migrations
		let appliedCount = 0;
		for (const entry of journal.entries) {
			if (appliedHashes.has(entry.tag)) {
				console.log(`Skipping already applied: ${entry.tag}`);
				continue;
			}

			const sqlPath = join(MIGRATIONS_DIR, `${entry.tag}.sql`);
			const sql = await readFile(sqlPath, "utf-8");

			console.log(`Applying migration: ${entry.tag}`);

			// Split by statement breakpoints and execute each statement
			const statements = sql
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);

			for (const statement of statements) {
				await client.query(statement);
			}

			// Record migration
			await client.query(
				"INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2)",
				[entry.tag, entry.when],
			);

			appliedCount++;
			console.log(`Applied: ${entry.tag}`);
		}

		if (appliedCount === 0) {
			console.log("No pending migrations");
		} else {
			console.log(`Applied ${appliedCount} migration(s)`);
		}
	} catch (error) {
		console.error("Migration failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main();
