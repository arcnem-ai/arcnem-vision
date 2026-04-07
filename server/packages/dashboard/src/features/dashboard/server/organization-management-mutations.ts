import { getDB } from "@arcnem-vision/db/server";
import { getAuthFeatureFlags } from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import {
	createBetterAuthOrganization,
	setBetterAuthActiveOrganization,
} from "./better-auth-api";
import { createUniqueSlug, requireDisplayName } from "./management-utils";
import { requireDashboardSessionContext } from "./session-context";

type CreateOrganizationInput = {
	name: string;
};

type SwitchOrganizationInput = {
	organizationId: string;
};

export const createOrganization = createServerFn({ method: "POST" })
	.inputValidator((input: CreateOrganizationInput) => input)
	.handler(async ({ data }) => {
		const db = getDB();
		const authFeatureFlags = getAuthFeatureFlags();
		await requireDashboardSessionContext();
		if (!authFeatureFlags.organizationCreationEnabled) {
			throw new Error(
				"Organization creation is disabled for this environment.",
			);
		}
		const name = requireDisplayName(data.name, "Organization name");
		const existingOrganizations = await db.query.organizations.findMany({
			columns: {
				slug: true,
			},
		});
		const slug = createUniqueSlug(
			name,
			existingOrganizations.map((organization) => organization.slug),
		);

		return await createBetterAuthOrganization({
			name,
			slug,
		});
	});

export const switchActiveOrganization = createServerFn({ method: "POST" })
	.inputValidator((input: SwitchOrganizationInput) => input)
	.handler(async ({ data }) => {
		const organizationId = data.organizationId.trim();
		await requireDashboardSessionContext();

		if (!organizationId) {
			throw new Error("Organization is required.");
		}

		return await setBetterAuthActiveOrganization({
			organizationId,
		});
	});
