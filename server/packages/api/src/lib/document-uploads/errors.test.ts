import { describe, expect, spyOn, test } from "bun:test";
import { Effect } from "effect";
import { Hono } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { UploadRejected } from "./acknowledge";
import {
	type AcknowledgementFailure,
	respondWithAcknowledgement,
} from "./errors";
import { DatabaseFailed, ObjectNotFound, StorageFailed } from "./services";

function respondTo(
	acknowledgement: Effect.Effect<unknown, AcknowledgementFailure>,
) {
	const app = new Hono<HonoServerContext>();
	app.use(async (c, next) => {
		// The mapping never touches these clients; the layer only needs them.
		c.set("s3Client", {} as never);
		c.set("dbClient", {} as never);
		c.set("inngestClient", {} as never);
		await next();
	});
	app.get("/", (c) => respondWithAcknowledgement(c, acknowledgement));
	return app.request("/");
}

describe("respondWithAcknowledgement", () => {
	test("returns the acknowledged upload", async () => {
		const response = await respondTo(
			Effect.succeed({ status: "verified", documentId: "doc" }),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "verified",
			documentId: "doc",
		});
	});

	test("reports a missing object as a 404", async () => {
		const response = await respondTo(
			Effect.fail(new ObjectNotFound({ objectKey: "uploads/a.png" })),
		);
		expect(response.status).toBe(404);
	});

	test("reports a rejected object with its status and limit", async () => {
		const response = await respondTo(
			Effect.fail(
				new UploadRejected({
					status: 413,
					message: "Too large",
					maxSizeBytes: 10,
				}),
			),
		);
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({
			message: "Too large",
			maxSizeBytes: 10,
		});
	});

	test("reports a storage failure as a 502 and logs its cause", async () => {
		const logged = spyOn(console, "error").mockImplementation(() => {});
		const response = await respondTo(
			Effect.fail(
				new StorageFailed({
					operation: "stat",
					objectKey: "uploads/a.png",
					cause: new Error("connection refused"),
				}),
			),
		);
		expect(response.status).toBe(502);
		expect(logged).toHaveBeenCalled();
		logged.mockRestore();
	});

	test("reports a database failure as a 500 and logs its cause", async () => {
		const logged = spyOn(console, "error").mockImplementation(() => {});
		const response = await respondTo(
			Effect.fail(
				new DatabaseFailed({
					operation: "find acknowledged upload",
					cause: new Error("connection terminated"),
				}),
			),
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			message: "Failed to acknowledge upload",
		});
		expect(logged).toHaveBeenCalled();
		logged.mockRestore();
	});
});
