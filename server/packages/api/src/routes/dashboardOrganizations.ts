import {
	createOrganizationInputSchema,
	getAuthFeatureFlags,
	switchOrganizationInputSchema,
} from "@arcnem-vision/shared";
import { Hono } from "hono";
import { proxyBetterAuthRequest } from "@/lib/better-auth-proxy";
import { requireDashboardSessionContext } from "@/lib/dashboard-auth";
import { createUniqueSlug, requireDisplayName } from "@/lib/management-utils";
import { readValidatedBody } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardOrganizationsRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardOrganizationsRouter.post("/dashboard/organizations", async (c) => {
	const access = await requireDashboardSessionContext(c);
	if (!access.ok) {
		return access.response;
	}

	const authFeatureFlags = getAuthFeatureFlags();
	if (!authFeatureFlags.organizationCreationEnabled) {
		return c.json(
			{
				message: "Organization creation is disabled for this environment.",
			},
			403,
		);
	}

	const parsed = await readValidatedBody(c, createOrganizationInputSchema);
	if (!parsed.ok) {
		return parsed.response;
	}

	const name = requireDisplayName(parsed.data.name, "Organization name");
	const existingOrganizations = await c
		.get("dbClient")
		.query.organizations.findMany({
			columns: {
				slug: true,
			},
		});
	const slug = createUniqueSlug(
		name,
		existingOrganizations.map((organization) => organization.slug),
	);

	const response = await proxyBetterAuthRequest<{
		id: string;
		name: string;
		slug: string;
	}>(c.req.raw, "/organization/create", {
		method: "POST",
		body: JSON.stringify({ name, slug }),
	});
	if (!response.ok) {
		return new Response(JSON.stringify({ message: response.message }), {
			status: response.status,
			headers: {
				"content-type": "application/json",
			},
		});
	}

	return c.json(response.data);
});

dashboardOrganizationsRouter.post(
	"/dashboard/organizations/switch",
	async (c) => {
		const access = await requireDashboardSessionContext(c);
		if (!access.ok) {
			return access.response;
		}

		const parsed = await readValidatedBody(c, switchOrganizationInputSchema);
		if (!parsed.ok) {
			return parsed.response;
		}

		const response = await proxyBetterAuthRequest<{
			id: string;
			name: string;
			slug: string;
		}>(c.req.raw, "/organization/set-active", {
			method: "POST",
			body: JSON.stringify({
				organizationId: parsed.data.organizationId.trim(),
			}),
		});
		if (!response.ok) {
			return new Response(JSON.stringify({ message: response.message }), {
				status: response.status,
				headers: {
					"content-type": "application/json",
				},
			});
		}

		return c.json(response.data);
	},
);
