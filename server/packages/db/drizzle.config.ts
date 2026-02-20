import { defineConfig } from "drizzle-kit";
import { DB_ENV_VAR } from "@/env/dbEnvVar"
import { getDBEnvVar } from "@/env/getDBEnvVar";

const DATABASE_URL = getDBEnvVar(DB_ENV_VAR.DATABASE_URL);

export default defineConfig({
  out: `./src/migrations`,
  schema: `./src/schema/index.ts`,
  dialect: `postgresql`,
  casing: `snake_case`,
  dbCredentials: {
    url: DATABASE_URL,
  },
});
