import { getDB } from "@arcnem-vision/db/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { pinoLogger } from "hono-pino";
import { serve } from "inngest/hono";
import { auth } from "@/lib/auth";
import { isTrustedOrigin } from "@/lib/auth-origins";
import { ackUploadRouter } from "@/routes/ackUpload";
import { authRouter } from "@/routes/auth";
import { getInngestClient } from "./clients/inngest";
import { getS3Client } from "./clients/s3";
import { isAPIDebugModeEnabled } from "./env/isAPIDebugModeEnabled";
import { dashboardRouter } from "./routes/dashboard";
import { dashboardDocumentsRouter } from "./routes/dashboardDocuments";
import { documentsRouter } from "./routes/documents";
import { uploadRouter } from "./routes/upload";
import type { HonoServerContext } from "./types/serverContext";

const app = new Hono<HonoServerContext>({
	strict: false,
});
const isDebugMode = isAPIDebugModeEnabled();

app.use(
	"*",
	cors({
		origin: (origin) => {
			if (!origin) return undefined;
			if (isDebugMode) return origin;
			if (isTrustedOrigin(origin)) return origin;
		},
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
		exposeHeaders: ["Content-Length", "X-Request-Id"],
		maxAge: 600,
		credentials: true,
	}),
);

app.use(requestId());

app.use(
	pinoLogger({
		pino: { level: "debug" },
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

app.on(["GET", "PUT", "POST"], "/api/inngest", (c) => {
	const inngestClient = c.get("inngestClient");

	const handler = serve({
		client: inngestClient,
		functions: [],
		serveHost: process.env.JOB_SERVER_URL,
	});

	return handler(c);
});

const routes = [
	authRouter,
	uploadRouter,
	ackUploadRouter,
	documentsRouter,
	dashboardDocumentsRouter,
	dashboardRouter,
];

routes.forEach((route) => {
	app.basePath("/api").route("/", route);
});

app.get("/health", async (c) => c.json({ status: "ok" }));

export default app;
