import { RedisClient } from "bun";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";

let redisClient: RedisClient | null = null;

export const getRedisClient = (): RedisClient => {
	if (!redisClient) {
		const REDIS_URL = getAPIEnvVar(API_ENV_VAR.REDIS_URL);
		redisClient = new RedisClient(REDIS_URL);
	}

	return redisClient;
};
