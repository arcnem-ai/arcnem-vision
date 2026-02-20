import type { PGDB } from "@arcnem-vision/db/server";
import type { ApiKey } from "better-auth/plugins";
import type { S3Client } from "bun";
import type { Inngest } from "inngest";
import type { AuthType } from "./auth";

export type ServerContext = AuthType & {
	s3Client: S3Client;
	inngestClient: Inngest;
	dbClient: PGDB;
	apiKey: Omit<ApiKey, "key"> | null;
};

export type HonoServerContext = { Variables: ServerContext };
