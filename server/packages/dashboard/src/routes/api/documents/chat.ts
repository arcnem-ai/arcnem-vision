import { createFileRoute } from "@tanstack/react-router";
import { DASHBOARD_ENV_VAR } from "@/env/dashboardEnvVar";
import { getDashboardEnvVar } from "@/env/getDashboardEnvVar";
import { getDashboardSessionCookieHeader } from "@/features/dashboard/server/better-auth-api";
import {
	createProxyRequestHeaders,
	createProxyResponse,
} from "@/lib/api-proxy";

export const Route = createFileRoute("/api/documents/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const cookieHeader = await getDashboardSessionCookieHeader();
				if (!cookieHeader) {
					return new Response("Unauthorized", { status: 401 });
				}

				const headers = createProxyRequestHeaders(request, cookieHeader, [
					"accept",
					"content-type",
				]);
				const requestBody = await request.text();

				const response = await fetch(
					`${getDashboardEnvVar(DASHBOARD_ENV_VAR.API_URL)}/api/dashboard/documents/chat`,
					{
						method: "POST",
						headers,
						body: requestBody.length > 0 ? requestBody : undefined,
					},
				);

				return createProxyResponse(response);
			},
		},
	},
});
