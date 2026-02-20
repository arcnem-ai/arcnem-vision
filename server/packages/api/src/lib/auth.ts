import { schema } from "@arcnem-vision/db";
import { getDB } from "@arcnem-vision/db/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, apiKey, organization } from "better-auth/plugins";
import { getRedisClient } from "@/clients/redis";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";

const db = getDB();
const redisClient = getRedisClient();
const clientOrigin = getAPIEnvVar("CLIENT_ORIGIN");
const isDebugMode = isAPIDebugModeEnabled();

export const auth = betterAuth({
	baseURL: getAPIEnvVar("BETTER_AUTH_BASE_URL"),
	experimental: { joins: true },
	trustedOrigins: isDebugMode ? ["*"] : [clientOrigin],
	advanced: {
		database: {
			generateId: false,
		},
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema,
	}),
	secret: getAPIEnvVar("BETTER_AUTH_SECRET"),
	secondaryStorage: {
		get: async (key) => await redisClient.get(key),
		set: async (key, value, ttl) => {
			if (ttl) await redisClient.set(key, value, "EX", ttl);
			else await redisClient.set(key, value);
		},
		delete: async (key) => {
			await redisClient.del(key);
		},
	},
	plugins: [
		apiKey({ storage: "secondary-storage", fallbackToDatabase: true }),
		organization(),
		admin(),
	],
});
