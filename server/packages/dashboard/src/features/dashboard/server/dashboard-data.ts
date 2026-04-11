import { type DashboardData, dashboardDataSchema } from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { fetchDashboardAPI } from "@/lib/api-server";

type GetDashboardDataInput = {
	includeArchived?: boolean;
};

export const getDashboardData = createServerFn({ method: "GET" })
	.inputValidator((input: GetDashboardDataInput | undefined) => input ?? {})
	.handler(async ({ data }): Promise<DashboardData> => {
		const params = new URLSearchParams();
		if (data.includeArchived === true) {
			params.set("includeArchived", "true");
		}

		return fetchDashboardAPI(
			`/dashboard/state${params.size > 0 ? `?${params.toString()}` : ""}`,
			{
				allowUnauthenticated: true,
				method: "GET",
				fallbackErrorMessage: "Failed to load dashboard data.",
			},
			dashboardDataSchema,
		);
	});
