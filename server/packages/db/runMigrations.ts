/**
 * Custom migration runner that bypasses drizzle-kit's broken dynamic import resolution.
 * Reads the migration journal and applies pending SQL migrations directly using pg.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "src/migrations");
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

const SCHEMA_RECOVERY_CHECKS = [
	{
		name: "agent graph tables",
		sql: "SELECT to_regclass('public.agent_graph_edges') IS NOT NULL AS ok",
	},
	{
		name: "segmentation table",
		sql: "SELECT to_regclass('public.document_segmentations') IS NOT NULL AS ok",
	},
	{
		name: "OCR table",
		sql: "SELECT to_regclass('public.document_ocr_results') IS NOT NULL AS ok",
	},
	{
		name: "template versions table",
		sql: "SELECT to_regclass('public.agent_graph_template_versions') IS NOT NULL AS ok",
	},
	{
		name: "models.version column",
		sql: `SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'models'
				AND column_name = 'version'
		) AS ok`,
	},
	{
		name: "presigned_uploads.organization_id column",
		sql: `SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'presigned_uploads'
				AND column_name = 'organization_id'
		) AS ok`,
	},
	{
		name: "documents.api_key_id column",
		sql: `SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'documents'
				AND column_name = 'api_key_id'
		) AS ok`,
	},
	{
		name: "apikeys.agent_graph_id column",
		sql: `SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'apikeys'
				AND column_name = 'agent_graph_id'
		) AS ok`,
	},
	{
		name: "agent_graph_templates.name removed",
		sql: `SELECT NOT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'agent_graph_templates'
				AND column_name = 'name'
		) AS ok`,
	},
] as const;

async function queryBoolean(client: Client, sql: string) {
	const { rows } = await client.query<{ ok: boolean }>(sql);
	return rows[0]?.ok === true;
}

async function schemaLooksFullyMigrated(client: Client) {
	for (const check of SCHEMA_RECOVERY_CHECKS) {
		if (!(await queryBoolean(client, check.sql))) {
			return false;
		}
	}

	return true;
}

async function backfillMigrationLedger(
	client: Client,
	entries: JournalEntry[],
) {
	await client.query("BEGIN");

	try {
		for (const entry of entries) {
			await client.query(
				"INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2)",
				[entry.tag, entry.when],
			);
			console.log(`Recovered applied migration: ${entry.tag}`);
		}

		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}
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

		if (
			appliedHashes.size === 0 &&
			journal.entries.length > 0 &&
			(await schemaLooksFullyMigrated(client))
		) {
			console.warn(
				"Detected existing schema with an empty migration ledger. Backfilling applied migrations.",
			);
			await backfillMigrationLedger(client, journal.entries);
			console.log(
				`Recovered ${journal.entries.length} migration record(s) without replaying SQL`,
			);
			return;
		}

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
