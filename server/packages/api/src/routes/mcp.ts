import {
	createMcpHandler,
	hostHeaderValidationResponse,
} from "@modelcontextprotocol/server";
import { Hono } from "hono";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { allowsPrivateWebhookDestinations } from "@/env/localOnlySettings";
import { mcpResourceUrl } from "@/lib/auth";
import { protectMcpRequest } from "@/lib/mcp-auth";
import { createVisionMcpServer } from "@/lib/mcp-server";
import type { HonoServerContext } from "@/types/serverContext";

export const mcpRouter = new Hono<HonoServerContext>();

mcpRouter.all("/mcp", async (c) => {
	const request = c.req.raw;
	const resource = new URL(mcpResourceUrl);
	const rejectedHost = hostHeaderValidationResponse(request, [
		resource.hostname,
	]);
	if (rejectedHost) return rejectedHost;
	const origin = request.headers.get("origin");
	const allowedOrigins = [
		resource.origin,
		getAPIEnvVar("CLIENT_ORIGIN"),
		getAPIEnvVar("DASHBOARD_ORIGIN"),
		...(process.env.TRUSTED_ORIGINS ?? "")
			.split(",")
			.map((value) => value.trim()),
	];
	if (origin && !allowedOrigins.includes(origin))
		return c.json({ message: "Origin not allowed" }, 403);
	return protectMcpRequest(request, (principal) =>
		createMcpHandler(
			() =>
				createVisionMcpServer(
					{
						db: c.get("dbClient"),
						s3: c.get("s3Client"),
						inngest: c.get("inngestClient"),
						webhookDestinations: {
							allowPrivateHttp: allowsPrivateWebhookDestinations(),
						},
					},
					principal,
				),
			{ responseMode: "json", maxSubscriptions: 0 },
		).fetch(request),
	);
});
