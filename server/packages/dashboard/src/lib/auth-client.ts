import { emailOTPClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const dashboardAuthBasePath = "/api/auth";

export function buildDashboardAuthPath(path = "") {
	if (!path) {
		return dashboardAuthBasePath;
	}

	return `${dashboardAuthBasePath}${path.startsWith("/") ? path : `/${path}`}`;
}

function getDashboardOrigin() {
	if (typeof window !== "undefined") {
		return window.location.origin;
	}

	// Better Auth validates the base URL during SSR module evaluation even though
	// the client instance is only used from browser event handlers.
	return "http://localhost";
}

export const authClient = createAuthClient({
	baseURL: getDashboardOrigin(),
	basePath: dashboardAuthBasePath,
	plugins: [emailOTPClient(), organizationClient()],
});

export const { signIn, signOut } = authClient;
