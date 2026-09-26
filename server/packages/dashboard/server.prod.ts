/**
 * Production server for the dashboard.
 *
 * Serves the built client assets, proxies auth and dashboard API requests to
 * the API, and hands every other route to the TanStack Start handler.
 *
 * Environment:
 *   PORT     Port to listen on (default 3001)
 *   API_URL  API base URL for the auth and dashboard API proxies
 */

import "zod/compile";

import * as path from "node:path";
import Bun from "bun";

const SERVER_PORT = Number(process.env.PORT ?? 3001);
const CLIENT_DIRECTORY = "./dist/client";
const SERVER_ENTRY_POINT = "./dist/server/server.js";
const AUTH_PROXY_BASE_PATH = "/api/auth";
const DASHBOARD_API_PROXY_BASE_PATH = "/api/dashboard";
const API_BASE_URL = process.env.API_URL?.trim();

// Files up to this size are kept in memory with a precomputed ETag and gzip.
const MAX_PRELOAD_BYTES = 5 * 1024 * 1024;
const GZIP_MIN_BYTES = 1024;
const GZIP_TYPES = [
	"text/",
	"application/javascript",
	"application/json",
	"application/xml",
	"image/svg+xml",
];

// Vite writes content-hashed filenames under /assets/, so only those can be
// cached forever. Stable names such as the favicon must be revalidated, or a
// deploy would never reach browsers that cached the old file.
const FINGERPRINTED_CACHE_CONTROL = "public, max-age=31536000, immutable";
const REVALIDATED_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export function cacheControlForAsset(route: string) {
	return route.startsWith("/assets/")
		? FINGERPRINTED_CACHE_CONTROL
		: REVALIDATED_CACHE_CONTROL;
}

type StaticRoute = (req: Request) => Response;

function computeEtag(data: Uint8Array): string {
	return `W/"${Bun.hash(data).toString(16)}-${data.byteLength.toString()}"`;
}

function gzipIfUseful(data: Uint8Array<ArrayBuffer>, type: string) {
	if (data.byteLength < GZIP_MIN_BYTES) return undefined;
	const compressible = GZIP_TYPES.some((prefix) =>
		prefix.endsWith("/") ? type.startsWith(prefix) : type === prefix,
	);
	return compressible ? Bun.gzipSync(data) : undefined;
}

function preloadedAssetRoute(
	route: string,
	type: string,
	raw: Uint8Array<ArrayBuffer>,
): StaticRoute {
	const etag = computeEtag(raw);
	const gz = gzipIfUseful(raw, type);
	const cacheControl = cacheControlForAsset(route);

	return (req) => {
		if (req.headers.get("if-none-match") === etag) {
			return new Response(null, {
				status: 304,
				headers: { ETag: etag, "Cache-Control": cacheControl },
			});
		}
		const headers: Record<string, string> = {
			"Content-Type": type,
			"Cache-Control": cacheControl,
			ETag: etag,
		};
		if (gz && req.headers.get("accept-encoding")?.includes("gzip")) {
			headers["Content-Encoding"] = "gzip";
			return new Response(gz, { headers });
		}
		return new Response(raw, { headers });
	};
}

export async function loadStaticRoutes(clientDirectory: string) {
	const routes: Record<string, StaticRoute> = {};
	let preloaded = 0;
	let onDemand = 0;

	for await (const relativePath of new Bun.Glob("**/*").scan({
		cwd: clientDirectory,
	})) {
		const filepath = path.join(clientDirectory, relativePath);
		const route = `/${relativePath.split(path.sep).join(path.posix.sep)}`;
		const file = Bun.file(filepath);
		if (file.size === 0) continue;
		const type = file.type || "application/octet-stream";

		if (file.size <= MAX_PRELOAD_BYTES) {
			routes[route] = preloadedAssetRoute(
				route,
				type,
				new Uint8Array(await file.arrayBuffer()),
			);
			preloaded += 1;
		} else {
			routes[route] = () =>
				new Response(Bun.file(filepath), {
					headers: {
						"Content-Type": type,
						"Cache-Control": cacheControlForAsset(route),
					},
				});
			onDemand += 1;
		}
	}

	console.log(
		`[INFO] Serving ${String(preloaded)} preloaded and ${String(onDemand)} on-demand static files`,
	);
	return routes;
}

async function proxyAPIRequest(
	req: Request,
	options?: { stripOrigin?: boolean },
): Promise<Response> {
	if (!API_BASE_URL) {
		return new Response("API_URL is not configured on the dashboard.", {
			status: 500,
		});
	}

	const requestURL = new URL(req.url);
	const targetURL = new URL(
		`${requestURL.pathname}${requestURL.search}`,
		API_BASE_URL,
	);
	const headers = new Headers(req.headers);
	headers.delete("host");
	if (options?.stripOrigin) {
		headers.delete("origin");
	}

	const body =
		req.method === "GET" || req.method === "HEAD"
			? undefined
			: await req.arrayBuffer();

	return await fetch(targetURL, {
		method: req.method,
		headers,
		body,
		redirect: "manual",
		// Forward compressed bytes with their original encoding headers.
		decompress: false,
	});
}

async function initializeServer() {
	let handler: { fetch: (request: Request) => Response | Promise<Response> };
	try {
		const serverModule = (await import(SERVER_ENTRY_POINT)) as {
			default: { fetch: (request: Request) => Response | Promise<Response> };
		};
		handler = serverModule.default;
	} catch (error) {
		console.log(`[ERROR] Failed to load server handler: ${String(error)}`);
		process.exit(1);
	}

	const staticRoutes = await loadStaticRoutes(CLIENT_DIRECTORY);

	const server = Bun.serve({
		port: SERVER_PORT,
		routes: {
			...staticRoutes,
			[`${AUTH_PROXY_BASE_PATH}/*`]: (req: Request) => proxyAPIRequest(req),
			[`${DASHBOARD_API_PROXY_BASE_PATH}/*`]: (req: Request) =>
				proxyAPIRequest(req, { stripOrigin: true }),
			"/*": (req: Request) => handler.fetch(req),
		},
		error(error) {
			console.log(
				`[ERROR] Uncaught server error: ${error instanceof Error ? error.message : String(error)}`,
			);
			return new Response("Internal Server Error", { status: 500 });
		},
	});

	console.log(
		`[INFO] Server listening on http://localhost:${String(server.port)}`,
	);
}

if (import.meta.main) {
	initializeServer().catch((error: unknown) => {
		console.log(`[ERROR] Failed to start server: ${String(error)}`);
		process.exit(1);
	});
}
