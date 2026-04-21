import { createFileRoute } from "@tanstack/react-router";
import { parseDashboardSearch } from "@/features/dashboard/dashboard-navigation";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { getDashboardData } from "@/features/dashboard/server-fns";
import { getDocuments } from "@/features/documents/server/documents-data";
import { getAgentGraphRuns } from "@/features/runs/server/runs-data";

export const Route = createFileRoute("/")({
	validateSearch: parseDashboardSearch,
	loaderDeps: ({ search }) => ({
		showArchived: search.showArchived,
	}),
	component: DashboardRoute,
	loader: async ({ deps }) => {
		const dashboard = await getDashboardData({
			data: {
				includeArchived: deps.showArchived,
			},
		});

		let documents = { documents: [], nextCursor: null } as Awaited<
			ReturnType<typeof getDocuments>
		>;
		let runs = { runs: [], nextCursor: null } as Awaited<
			ReturnType<typeof getAgentGraphRuns>
		>;
		if (dashboard.organization) {
			const [docsResult, runsResult] = await Promise.allSettled([
				getDocuments({ data: {} }),
				getAgentGraphRuns({
					data: { organizationId: dashboard.organization.id },
				}),
			]);
			if (docsResult.status === "fulfilled") {
				documents = docsResult.value;
			}
			if (runsResult.status === "fulfilled") {
				runs = runsResult.value;
			}
		}

		return { dashboard, documents, runs };
	},
});

function DashboardRoute() {
	const search = Route.useSearch();
	const { dashboard, documents, runs } = Route.useLoaderData();
	return (
		<DashboardPage
			dashboard={dashboard}
			documents={documents}
			runs={runs}
			showArchived={search.showArchived}
			activeTab={search.tab}
		/>
	);
}
