import { describe, expect, test } from "bun:test";
import {
	pinnedPublicHttpsDestination,
	postToPublicHttps,
} from "./public-https";

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

// isPublicRoutableHost comes from a Better Auth internal module (pinned in
// package.json). These cases fail if an upgrade changes what it allows.
describe("pinnedPublicHttpsDestination", () => {
	const url = new URL("https://hooks.example.com/vision?x=1");

	test("refuses any non-public resolved address", () => {
		for (const address of [
			"0.0.0.0",
			"10.1.2.3",
			"100.64.0.1",
			"127.0.0.1",
			"169.254.169.254",
			"172.16.0.1",
			"192.168.1.1",
			"::",
			"::1",
			"::ffff:127.0.0.1",
			"fc00::1",
			"fe80::1",
		]) {
			expect(() =>
				pinnedPublicHttpsDestination(url, [
					{ address: "93.184.216.34", family: 4 },
					{ address, family: address.includes(":") ? 6 : 4 },
				]),
			).toThrow(TypeError);
		}
	});

	test("connects to the checked address with the original server name", () => {
		expect(
			pinnedPublicHttpsDestination(url, [
				{ address: "93.184.216.34", family: 4 },
			]),
		).toEqual({
			hostname: "93.184.216.34",
			port: 443,
			servername: "hooks.example.com",
			path: "/vision?x=1",
		});
	});
});
