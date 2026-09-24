import { describe, expect, test } from "bun:test";
import { isRetryableWebhookResult } from "./deliver";

describe("webhook retry policy", () => {
	test("retries transient failures and stops on everything else", () => {
		for (const status of [408, 429, 500, 502, 503])
			expect(isRetryableWebhookResult({ kind: "response", status })).toBe(true);
		for (const status of [301, 400, 401, 404, 410, 422])
			expect(isRetryableWebhookResult({ kind: "response", status })).toBe(
				false,
			);
		for (const category of ["dns", "timeout", "network"] as const)
			expect(isRetryableWebhookResult({ kind: "error", category })).toBe(true);
		expect(
			isRetryableWebhookResult({
				kind: "error",
				category: "blocked_destination",
			}),
		).toBe(false);
	});
});
