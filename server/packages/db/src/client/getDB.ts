import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { DB_ENV_VAR } from "../env/dbEnvVar";
import { getDBEnvVar } from "../env/getDBEnvVar";
import * as schema from "../schema";

export type PGDB = NodePgDatabase<typeof schema> & {
	$client: Pool;
};

let db: PGDB | null = null;

export const getDB = (): PGDB => {
	if (!db) {
		const DATABASE_URL = getDBEnvVar(DB_ENV_VAR.DATABASE_URL);

		db = drizzle({
			connection: {
				connectionString: DATABASE_URL,
			},
			casing: "snake_case",
			schema,
		});
	}

	return db;
};
