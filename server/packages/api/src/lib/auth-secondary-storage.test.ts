import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { RedisClient } from "bun";
import { incrementWithTTL } from "@/lib/auth-secondary-storage";

test("incrementWithTTL sends one atomic script for the key and TTL", async () => {
	const sent: [string, string[]][] = [];
	const result = await incrementWithTTL(
		{
			async send(command, args) {
				sent.push([command, args]);
				return "2";
			},
		},
		"rate-limit:user",
		60,
	);

	expect(sent).toHaveLength(1);
	expect(sent[0]?.[0]).toBe("EVAL");
	expect(sent[0]?.[1].slice(1)).toEqual(["1", "rate-limit:user", "60"]);
	expect(result).toBe(2);
});

// TEST_REDIS_URL enables this check against a disposable Redis.
const redisURL = process.env.TEST_REDIS_URL;
const describeRedis = redisURL ? describe : describe.skip;

describeRedis("incrementWithTTL on Redis", () => {
	test("starts a fixed window: later increments never extend the expiry", async () => {
		const client = new RedisClient(redisURL);
		const key = `test:rate-limit:${randomUUID()}`;
		try {
			expect(await incrementWithTTL(client, key, 60)).toBe(1);
			const firstTTL = Number(await client.send("PTTL", [key]));
			expect(firstTTL).toBeGreaterThan(59_000);

			await Bun.sleep(50);
			expect(await incrementWithTTL(client, key, 60)).toBe(2);
			const secondTTL = Number(await client.send("PTTL", [key]));

			expect(secondTTL).toBeLessThan(firstTTL);
		} finally {
			await client.send("DEL", [key]);
			client.close();
		}
	});
});
