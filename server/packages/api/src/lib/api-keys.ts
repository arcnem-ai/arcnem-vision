import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import { hashAPIKey } from "@arcnem-vision/shared";
import { and, eq, gt, isNull, or } from "drizzle-orm";

const { apikeys } = schema;

export async function verifyAPIKey(
	dbClient: PGDB,
	rawKey: string,
): Promise<{ id: string } | null> {
	const hashedKey = await hashAPIKey(rawKey);
	const [apiKey] = await dbClient
		.select({
			id: apikeys.id,
		})
		.from(apikeys)
		.where(
			and(
				eq(apikeys.key, hashedKey),
				eq(apikeys.enabled, true),
				or(isNull(apikeys.expiresAt), gt(apikeys.expiresAt, new Date())),
			),
		)
		.limit(1);

	if (!apiKey) {
		return null;
	}

	return {
		id: apiKey.id,
	};
}
