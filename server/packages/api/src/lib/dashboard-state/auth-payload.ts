import type { DashboardData } from "@arcnem-vision/shared";
import { getAuthFeatureFlags } from "@arcnem-vision/shared";
import type { DashboardSessionContext } from "../dashboard-auth";

const debugSessionBootstrapEnabled = process.env.API_DEBUG === "true";

type DashboardAuthPayload = DashboardData["auth"];

export function buildDashboardAuthPayload(
	context: DashboardSessionContext,
): DashboardAuthPayload {
	const authFeatureFlags = getAuthFeatureFlags();

	return {
		state: context.session ? "ready" : "missing",
		source: context.source,
		sessionPreview: context.sessionPreview,
		userName: context.user?.name ?? null,
		userEmail: context.user?.email ?? null,
		activeOrganizationId: context.session?.activeOrganizationId ?? null,
		signUpEnabled: authFeatureFlags.signUpEnabled,
		organizationCreationEnabled: authFeatureFlags.organizationCreationEnabled,
		debugSessionBootstrapEnabled,
	};
}
