import "zod/compile";

import { getDB } from "@arcnem-vision/db/server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { openAPIRouteHandler } from "hono-openapi";
import { pinoLogger } from "hono-pino";
import { serve } from "inngest/hono";
import { auth } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/auth-origins";
import { createWebhookDeliveryFunction } from "@/lib/webhooks/deliver";
import { requireWebhookSecretEncryptionKey } from "@/lib/webhooks/signing";
import { ackUploadRouter } from "@/routes/ackUpload";
import { authRouter } from "@/routes/auth";
import { getInngestClient } from "./clients/inngest";
import { getS3Client } from "./clients/s3";
import { MAX_API_BODY_BYTES } from "./constants/requests";
import {
	allowsPrivateWebhookDestinations,
	assertLocalOnlySettings,
	isAPIDebugModeEnabled,
} from "./env/localOnlySettings";
import { dashboardRouter } from "./routes/dashboard";
import { dashboardDocumentsRouter } from "./routes/dashboardDocuments";
import { documentsRouter } from "./routes/documents";
import { mcpRouter } from "./routes/mcp";
import { serviceRouter } from "./routes/service";
import { serviceWebhooksRouter } from "./routes/serviceWebhooks";
import { uploadRouter } from "./routes/upload";
import type { HonoServerContext } from "./types/serverContext";

const app = new Hono<HonoServerContext>({
	strict: false,
});
assertLocalOnlySettings();
const isDebugMode = isAPIDebugModeEnabled();
requireWebhookSecretEncryptionKey();

app.use(
	"*",
	cors({
		origin: (origin) => {
			if (!origin) return undefined;
			if (isDebugMode) return origin;
			if (isTrustedOrigin(origin)) return origin;
		},
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"x-api-key",
			"MCP-Protocol-Version",
			"MCP-Session-Id",
			"DPoP",
		],
		exposeHeaders: [
			"Content-Length",
			"X-Request-Id",
			"WWW-Authenticate",
			"MCP-Protocol-Version",
			"MCP-Session-Id",
		],
		maxAge: 600,
		credentials: true,
	}),
);

app.use(requestId());

// Uploads go straight to storage, so API bodies are small JSON. Inngest's own
// callbacks carry run state and are exempt.
const apiBodyLimit = bodyLimit({
	maxSize: MAX_API_BODY_BYTES,
	onError: (c) =>
		c.json(
			{
				message: `Request body exceeds ${MAX_API_BODY_BYTES} bytes`,
				maxBytes: MAX_API_BODY_BYTES,
			},
			413,
		),
});
app.use("/api/*", (c, next) =>
	c.req.path === "/api/inngest" ? next() : apiBodyLimit(c, next),
);

app.use(
	pinoLogger({
		pino: {
			level: "debug",
			redact: [
				'req.headers["x-api-key"]',
				"req.headers.authorization",
				"req.headers.cookie",
				"req.headers.dpop",
			],
		},
	}),
);

app.use("*", async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	c.set("user", session?.user ?? null);
	c.set("session", session?.session ?? null);

	await next();
});

app.use("*", async (c, next) => {
	const s3Client = getS3Client();

	c.set("s3Client", s3Client);

	await next();
});

app.use("*", async (c, next) => {
	const inngestClient = getInngestClient();

	c.set("inngestClient", inngestClient);

	await next();
});

app.use("*", async (c, next) => {
	const dbClient = getDB();

	c.set("dbClient", dbClient);

	await next();
});

const inngestFunctions = [
	createWebhookDeliveryFunction(getInngestClient(), getDB, {
		allowPrivateHttp: allowsPrivateWebhookDestinations(),
	}),
];

app.on(["GET", "PUT", "POST"], "/api/inngest", (c) => {
	const inngestClient = c.get("inngestClient");

	const handler = serve({
		client: inngestClient,
		functions: inngestFunctions,
		serveOrigin: process.env.JOB_SERVER_URL,
	});

	return handler(c);
});

const routes = [
	authRouter,
	uploadRouter,
	ackUploadRouter,
	documentsRouter,
	serviceRouter,
	serviceWebhooksRouter,
	mcpRouter,
	dashboardDocumentsRouter,
	dashboardRouter,
];

routes.forEach((route) => {
	app.basePath("/api").route("/", route);
});

// OAuth discovery is rooted at the API origin, outside the /api route group.
app.get("/.well-known/*", (c) => auth.handler(c.req.raw));

app.get(
	"/api/openapi.json",
	openAPIRouteHandler(app, {
		documentation: {
			openapi: "3.1.0",
			info: {
				title: "Arcnem Vision Service API",
				version: "1.0.0",
				description:
					"Project-scoped image ingestion and workflow orchestration API for service integrations.",
			},
			tags: [
				{
					name: "Service",
					description:
						"Upload images, acknowledge documents, run workflows, search documents, and manage visibility with service API keys.",
				},
			],
			security: [{ ApiKeyAuth: [] }],
			components: {
				securitySchemes: {
					ApiKeyAuth: {
						type: "apiKey",
						in: "header",
						name: "x-api-key",
					},
				},
			},
		},
		includeEmptyPaths: false,
	}),
);

app.get("/health", async (c) => c.json({ status: "ok" }));

export default app;
