import { describe, expect, test } from "bun:test";
import {
	copyFile,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("production proxy preserves compressed auth responses, cookies, and redirects", async () => {
	const payload = {
		redirect: true,
		url: `https://app.example.com/oauth/consent?${"a".repeat(2000)}`,
	};
	const compressed = Bun.gzipSync(JSON.stringify(payload));
	const receivedOrigins: (string | null)[] = [];
	let followedRedirect = false;
	const upstream = Bun.serve({
		port: 0,
		fetch(request) {
			const pathname = new URL(request.url).pathname;
			if (pathname === "/redirect-target") followedRedirect = true;
			if (pathname === "/api/auth/redirect") {
				return new Response(null, {
					status: 302,
					headers: { location: "/redirect-target" },
				});
			}
			receivedOrigins.push(request.headers.get("origin"));
			const headers = new Headers({
				"content-type": "application/json",
				"content-encoding": "gzip",
				"content-length": String(compressed.length),
			});
			headers.append("set-cookie", "session=synthetic; HttpOnly; Path=/");
			headers.append("set-cookie", "flow=synthetic; HttpOnly; Path=/");
			return new Response(compressed, { headers });
		},
	});
	const fixture = await mkdtemp(join(tmpdir(), "dashboard-proxy-"));
	let child: ReturnType<typeof Bun.spawn> | undefined;
	let startupTimeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await mkdir(join(fixture, "dist/server"), { recursive: true });
		await mkdir(join(fixture, "dist/client"), { recursive: true });
		await writeFile(
			join(fixture, "dist/server/server.js"),
			'export default { fetch: () => new Response("Not found", { status: 404 }) };',
		);
		await copyFile(
			new URL("../../server.prod.ts", import.meta.url),
			join(fixture, "server.prod.ts"),
		);
		await symlink(
			new URL("../../node_modules", import.meta.url).pathname,
			join(fixture, "node_modules"),
			"dir",
		);
		child = Bun.spawn([process.execPath, join(fixture, "server.prod.ts")], {
			cwd: fixture,
			env: { ...process.env, PORT: "0", API_URL: upstream.url.toString() },
			stdout: "pipe",
			stderr: "pipe",
		});
		startupTimeout = setTimeout(() => child?.kill(), 5000);
		const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
		let output = "";
		let proxyURL: string | undefined;
		try {
			while (!proxyURL) {
				const { done, value } = await reader.read();
				if (done) throw new Error(`Production proxy did not start: ${output}`);
				output += new TextDecoder().decode(value);
				proxyURL = output.match(
					/Server listening on (http:\/\/localhost:\d+)/,
				)?.[1];
			}
		} finally {
			reader.releaseLock();
			clearTimeout(startupTimeout);
		}
		for (const prefix of ["/api/auth", "/api/dashboard"]) {
			const response = await fetch(`${proxyURL}${prefix}/compressed`, {
				headers: { origin: "https://app.example.com" },
			});
			expect(response.status).toBe(200);
			expect(response.headers.get("content-encoding")).toBe("gzip");
			expect(response.headers.getSetCookie()).toEqual([
				"session=synthetic; HttpOnly; Path=/",
				"flow=synthetic; HttpOnly; Path=/",
			]);
			expect(await response.json()).toEqual(payload);
		}
		expect(receivedOrigins).toEqual(["https://app.example.com", null]);
		const redirect = await fetch(`${proxyURL}/api/auth/redirect`, {
			redirect: "manual",
		});
		expect(redirect.status).toBe(302);
		expect(redirect.headers.get("location")).toBe("/redirect-target");
		expect(followedRedirect).toBe(false);
	} finally {
		clearTimeout(startupTimeout);
		child?.kill();
		if (child) await child.exited;
		upstream.stop(true);
		await rm(fixture, { recursive: true, force: true });
	}
}, 10000);
