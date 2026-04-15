import type { PGDB } from "@arcnem-vision/db/server";
import type { S3Client } from "bun";
import type { Inngest } from "inngest";
import type { VerifiedAPIKey } from "@/lib/api-keys";
import type { AuthType } from "./auth";

export type ServerContext = AuthType & {
	s3Client: S3Client;
	inngestClient: Inngest;
	dbClient: PGDB;
	apiKey: VerifiedAPIKey | null;
};

export type HonoServerContext = { Variables: ServerContext };
