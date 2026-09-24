import { describe, expect, test } from "bun:test";
import { postToPublicHttps } from "./public-https";

const post = (url: string) =>
	postToPublicHttps({
		url: new URL(url),
		headers: { "content-type": "application/json" },
		body: "{}",
		timeoutMs: 2_000,
	});

describe("postToPublicHttps", () => {
	test("refuses private, loopback and non-HTTPS destinations before connecting", async () => {
		for (const url of [
			"https://127.0.0.1/hook",
			"https://[::1]/hook",
			"https://169.254.169.254/latest",
			"https://10.0.0.8/hook",
			"http://93.184.216.34/hook",
			"https://user:pass@93.184.216.34/hook",
		]) {
			expect(await post(url)).toEqual({
				kind: "error",
				category: "blocked_destination",
			});
		}
	});
});
