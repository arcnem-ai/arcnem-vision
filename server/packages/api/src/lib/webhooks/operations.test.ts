import { describe, expect, test } from "bun:test";
import { ServiceError } from "@/lib/service-error";
import { validateWebhookUrl } from "./operations";

const publicOnly = { allowPrivateHttp: false };

describe("validateWebhookUrl", () => {
	test("rejects non-HTTPS, credentials and fragments before resolving", async () => {
		let resolved = 0;
		const resolve = async () => {
			resolved++;
		};
		for (const url of [
			"http://example.com/hook",
			"https://user:pass@example.com/hook",
			"https://example.com/hook#frag",
			"not a url",
		])
			await expect(
				validateWebhookUrl(url, publicOnly, resolve),
			).rejects.toBeInstanceOf(ServiceError);
		expect(resolved).toBe(0);
	});

	test("gives up on a slow resolver instead of holding the request open", async () => {
		const started = Date.now();
		await expect(
			validateWebhookUrl(
				"https://slow.example.com/hook",
				publicOnly,
				() => new Promise(() => {}),
				50,
			),
		).rejects.toThrow("could not be resolved");
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	test("reports destinations that resolve to private addresses", async () => {
		await expect(
			validateWebhookUrl("https://internal.example.com/hook", publicOnly, () =>
				Promise.reject(
					new TypeError("Destination must resolve only to public addresses"),
				),
			),
		).rejects.toThrow("public addresses");
	});

	test("allows local http receivers only in debug mode, without resolving", async () => {
		const url = await validateWebhookUrl(
			"http://localhost:3999/webhooks/vision",
			{ allowPrivateHttp: true },
			() => Promise.reject(new Error("should not resolve")),
		);
		expect(url.host).toBe("localhost:3999");
	});
});
