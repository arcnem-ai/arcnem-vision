import { describe, expect, test } from "bun:test";
import { generateSpecs } from "hono-openapi";
import { serviceWebhooksRouter } from "./serviceWebhooks";

describe("service webhook openapi", () => {
	test("describes endpoint management, delivery history and resend", async () => {
		const spec = await generateSpecs(serviceWebhooksRouter, {
			documentation: {
				openapi: "3.1.0",
				info: { title: "Arcnem Vision Service API", version: "1.0.0" },
			},
			includeEmptyPaths: false,
		});

		expect(
			spec.paths["/service/webhook-endpoints"]?.post?.responses,
		).toHaveProperty("201");
		expect(spec.paths["/service/webhook-endpoints"]?.get).toBeDefined();
		expect(
			spec.paths["/service/webhook-endpoints/{id}"]?.delete?.responses,
		).toHaveProperty("404");
		expect(spec.paths["/service/webhook-deliveries"]?.get?.parameters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "executionId", in: "query" }),
			]),
		);
		expect(
			spec.paths["/service/webhook-deliveries/{id}/resend"]?.post?.responses,
		).toHaveProperty("202");
	});
});
