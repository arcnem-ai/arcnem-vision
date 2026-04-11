import { describe, expect, test } from "bun:test";
import {
	createProxyRequestHeaders,
	createProxyResponse,
	sanitizeProxyResponseHeaders,
} from "./api-proxy";

describe("createProxyRequestHeaders", () => {
	test("forwards only the requested headers plus the dashboard session cookie", () => {
		const request = new Request("http://localhost/api/documents/chat", {
			headers: {
				accept: "text/event-stream",
				authorization: "Bearer should-not-forward",
				"content-type": "application/json",
				origin: "http://localhost:3001",
			},
		});

		const headers = createProxyRequestHeaders(request, "session=abc", [
			"accept",
			"content-type",
			"origin",
		]);

		expect(headers.get("cookie")).toBe("session=abc");
		expect(headers.get("accept")).toBe("text/event-stream");
		expect(headers.get("content-type")).toBe("application/json");
		expect(headers.get("origin")).toBe("http://localhost:3001");
		expect(headers.has("authorization")).toBe(false);
	});
});

describe("sanitizeProxyResponseHeaders", () => {
	test("strips hop-by-hop headers and preserves SSE-safe headers", () => {
		const headers = sanitizeProxyResponseHeaders(
			new Headers({
				"cache-control": "no-cache, no-transform",
				connection: "keep-alive",
				"content-length": "123",
				"content-type": "text/event-stream",
				"transfer-encoding": "chunked",
				"x-accel-buffering": "no",
			}),
		);

		expect(headers.get("cache-control")).toBe("no-cache, no-transform");
		expect(headers.get("content-type")).toBe("text/event-stream");
		expect(headers.get("x-accel-buffering")).toBe("no");
		expect(headers.has("connection")).toBe(false);
		expect(headers.has("content-length")).toBe(false);
		expect(headers.has("transfer-encoding")).toBe(false);
	});
});

describe("createProxyResponse", () => {
	test("relays streamed response chunks without forwarding hop-by-hop headers", async () => {
		const encoder = new TextEncoder();
		const upstream = new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode("chunk-1"));
					controller.enqueue(encoder.encode("chunk-2"));
					controller.close();
				},
			}),
			{
				headers: {
					"cache-control": "no-cache",
					connection: "keep-alive",
					"content-type": "text/event-stream",
					"transfer-encoding": "chunked",
				},
				status: 202,
				statusText: "Accepted",
			},
		);

		const response = createProxyResponse(upstream);

		expect(response.status).toBe(202);
		expect(response.statusText).toBe("Accepted");
		expect(response.headers.get("content-type")).toBe("text/event-stream");
		expect(response.headers.has("connection")).toBe(false);
		expect(response.headers.has("transfer-encoding")).toBe(false);
		expect(await response.text()).toBe("chunk-1chunk-2");
	});
});
