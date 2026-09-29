import { describe, expect, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { ServiceError } from "@/lib/service-error";
import type { HonoServerContext } from "@/types/serverContext";
import {
	handleDashboardWorkflowError,
	workflowDraftErrorResponse,
} from "./errors";

function appThrowing(error: unknown) {
	const app = new Hono<HonoServerContext>();
	app.onError(handleDashboardWorkflowError);
	app.get("/", () => {
		throw error;
	});
	return app;
}

describe("handleDashboardWorkflowError", () => {
	test("returns a ServiceError's status and message", async () => {
		const response = await appThrowing(
			new ServiceError(404, "Template not found in your organization."),
		).request("/");
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			message: "Template not found in your organization.",
		});
	});

	test("returns invalid workflow input as a 400", async () => {
		const result = z.object({ name: z.string() }).safeParse({});
		const response = await appThrowing(result.error).request("/");
		expect(response.status).toBe(400);
	});

	test("leaves other errors to the server error handler", async () => {
		const outer = new Hono<HonoServerContext>();
		outer.onError((_error, c) => c.text("server error", 500));
		outer.route("/", appThrowing(new Error("insert returned nothing")));
		const response = await outer.request("/");
		expect(response.status).toBe(500);
	});
});

describe("workflowDraftErrorResponse", () => {
	function draftApp(error: unknown) {
		const app = new Hono<HonoServerContext>();
		app.get("/", (c) => workflowDraftErrorResponse(c, error));
		return app;
	}

	test("returns a problem with the draft as its ServiceError", async () => {
		const response = await draftApp(
			new ServiceError(400, "Email is not supported."),
		).request("/");
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			message: "Email is not supported.",
		});
	});

	test("reports a generation failure as a 502 without its internal message", async () => {
		const logged = spyOn(console, "error").mockImplementation(() => {});
		const providerError = Object.assign(
			new Error("401 Incorrect API key provided: sk-proj-abc123"),
			{ status: 401, code: "invalid_api_key", type: "invalid_request_error" },
		);
		const response = await draftApp(providerError).request("/");
		expect(response.status).toBe(502);
		expect(JSON.stringify(await response.json())).not.toContain("sk-");
		// The log keeps what identifies the failure, never its message.
		expect(JSON.stringify(logged.mock.calls)).not.toContain("sk-");
		expect(logged.mock.calls[0]?.[1]).toEqual({
			name: "Error",
			status: 401,
			code: "invalid_api_key",
			type: "invalid_request_error",
		});
		logged.mockRestore();
	});
});
