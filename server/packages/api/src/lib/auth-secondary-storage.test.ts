import { expect, test } from "bun:test";
import { incrementWithTTL } from "@/lib/auth-secondary-storage";

test("incrementWithTTL atomically starts a fixed expiry window", async () => {
	let command = "";
	let args: string[] = [];
	const result = await incrementWithTTL(
		{
			async send(receivedCommand, receivedArgs) {
				command = receivedCommand;
				args = receivedArgs;
				return "2";
			},
		},
		"rate-limit:user",
		60,
	);

	expect(command).toBe("EVAL");
	expect(args.slice(1)).toEqual(["1", "rate-limit:user", "60"]);
	expect(args[0]).toContain("redis.call('INCR', KEYS[1])");
	expect(args[0]).toContain(
		"if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end",
	);
	expect(result).toBe(2);
	expect(typeof result).toBe("number");
});
