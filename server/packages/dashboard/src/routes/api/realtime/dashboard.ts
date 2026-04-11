import { createFileRoute } from "@tanstack/react-router";
import { DASHBOARD_ENV_VAR } from "@/env/dashboardEnvVar";
import { getDashboardEnvVar } from "@/env/getDashboardEnvVar";
import { getDashboardSessionCookieHeader } from "@/features/dashboard/server/better-auth-api";
import {
	createProxyRequestHeaders,
	createProxyResponse,
} from "@/lib/api-proxy";

export const Route = createFileRoute("/api/realtime/dashboard")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const cookieHeader = await getDashboardSessionCookieHeader();
				if (!cookieHeader) {
					return new Response("Unauthorized", { status: 401 });
				}
				const headers = createProxyRequestHeaders(request, cookieHeader, [
					"accept",
					"cache-control",
					"last-event-id",
				]);

				const response = await fetch(
					`${getDashboardEnvVar(DASHBOARD_ENV_VAR.API_URL)}/api/dashboard/realtime`,
					{
						method: "GET",
						headers,
					},
				);

				return createProxyResponse(response);
			},
		},
	},
});
