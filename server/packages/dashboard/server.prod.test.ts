import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStaticRoutes } from "./server.prod";

let clientDirectory: string;
let routes: Awaited<ReturnType<typeof loadStaticRoutes>>;

beforeAll(async () => {
	clientDirectory = await mkdtemp(join(tmpdir(), "dashboard-assets-"));
	await mkdir(join(clientDirectory, "assets"));
	await writeFile(
		join(clientDirectory, "assets/index-D3LPUugg.js"),
		`console.log(${JSON.stringify("x".repeat(4096))});`,
	);
	await writeFile(join(clientDirectory, "favicon.ico"), "icon");
	routes = await loadStaticRoutes(clientDirectory);
});

afterAll(async () => {
	await rm(clientDirectory, { recursive: true, force: true });
});

describe("dashboard static assets", () => {
	test("caches content-hashed assets as immutable", () => {
		const response = routes["/assets/index-D3LPUugg.js"](
			new Request("http://localhost/assets/index-D3LPUugg.js"),
		);
		expect(response.headers.get("cache-control")).toBe(
			"public, max-age=31536000, immutable",
		);
	});

	test("makes stable filenames revalidate so a deploy reaches browsers", async () => {
		const response = routes["/favicon.ico"](
			new Request("http://localhost/favicon.ico"),
		);
		expect(response.headers.get("cache-control")).toBe(
			"public, max-age=0, must-revalidate",
		);
		expect(await response.text()).toBe("icon");

		const etag = response.headers.get("etag") as string;
		const revalidated = routes["/favicon.ico"](
			new Request("http://localhost/favicon.ico", {
				headers: { "if-none-match": etag },
			}),
		);
		expect(revalidated.status).toBe(304);
	});

	test("gzips compressible assets for clients that accept it", async () => {
		const response = routes["/assets/index-D3LPUugg.js"](
			new Request("http://localhost/assets/index-D3LPUugg.js", {
				headers: { "accept-encoding": "gzip" },
			}),
		);
		expect(response.headers.get("content-encoding")).toBe("gzip");
		const body = new Uint8Array(await response.arrayBuffer());
		expect(new TextDecoder().decode(Bun.gunzipSync(body))).toContain(
			"console.log",
		);
	});
});
