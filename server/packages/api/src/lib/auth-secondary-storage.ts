type RedisEvalClient = {
	send(command: string, args: string[]): Promise<unknown>;
};

const INCREMENT_WITH_TTL_SCRIPT =
	"local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return value";

export async function incrementWithTTL(
	client: RedisEvalClient,
	key: string,
	ttl: number,
): Promise<number> {
	return Number(
		await client.send("EVAL", [
			INCREMENT_WITH_TTL_SCRIPT,
			"1",
			key,
			String(ttl),
		]),
	);
}
