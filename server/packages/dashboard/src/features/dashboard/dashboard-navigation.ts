export const dashboardTabValues = [
	"project-view",
	"workflow-view",
	"documents-view",
	"runs-view",
] as const;

export type DashboardTab = (typeof dashboardTabValues)[number];

export type DashboardSearch = {
	showArchived: boolean;
	tab: DashboardTab;
};

export const DEFAULT_DASHBOARD_TAB: DashboardTab = "project-view";

const dashboardTabSet = new Set<DashboardTab>(dashboardTabValues);

export function isDashboardTab(value: string): value is DashboardTab {
	return dashboardTabSet.has(value as DashboardTab);
}

export function parseDashboardSearch(
	search: Record<string, unknown>,
): DashboardSearch {
	return {
		showArchived:
			search.showArchived === true || search.showArchived === "true",
		tab:
			typeof search.tab === "string" && isDashboardTab(search.tab)
				? search.tab
				: DEFAULT_DASHBOARD_TAB,
	};
}
