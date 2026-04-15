import { beforeAll, describe, expect, test } from "bun:test";
import { generateSpecs } from "hono-openapi";

let serviceRouter: typeof import("./service").serviceRouter;

beforeAll(async () => {
	process.env.S3_BUCKET ??= "test-bucket";
	process.env.S3_ENDPOINT ??= "http://localhost:9000";
	process.env.S3_REGION ??= "auto";
	process.env.S3_ACCESS_KEY_ID ??= "test";
	process.env.S3_SECRET_ACCESS_KEY ??= "test";

	({ serviceRouter } = await import("./service"));
});

describe("service openapi", () => {
	test("describes the service workflow and document routes", async () => {
		const spec = await generateSpecs(serviceRouter, {
			documentation: {
				openapi: "3.1.0",
				info: {
					title: "Arcnem Vision Service API",
					version: "1.0.0",
				},
			},
			includeEmptyPaths: false,
		});

		expect(spec.paths["/service/workflows"]?.get).toBeDefined();
		expect(
			spec.paths["/service/workflow-executions"]?.post?.responses,
		).toHaveProperty("202");
		expect(
			spec.paths["/service/workflow-executions"]?.post?.requestBody,
		).toMatchObject({
			required: true,
			content: {
				"application/json": {
					schema: expect.any(Object),
				},
			},
		});
		expect(spec.paths["/service/documents"]?.get?.parameters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "deviceBound", in: "query" }),
			]),
		);
	});
});
