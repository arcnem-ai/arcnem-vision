import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { getDashboardData } from "@/features/dashboard/server-fns";
import { getDocuments } from "@/features/documents/server/documents-data";
import { getAgentGraphRuns } from "@/features/runs/server/runs-data";

export const Route = createFileRoute("/")({
	component: DashboardRoute,
	loader: async () => {
		const dashboard = await getDashboardData();

		let documents = { documents: [], nextCursor: null } as Awaited<
			ReturnType<typeof getDocuments>
		>;
		let runs = { runs: [], nextCursor: null } as Awaited<
			ReturnType<typeof getAgentGraphRuns>
		>;
		if (dashboard.organization) {
			const orgId = dashboard.organization.id;
			const [docsResult, runsResult] = await Promise.allSettled([
				getDocuments({ data: { organizationId: orgId } }),
				getAgentGraphRuns({ data: { organizationId: orgId } }),
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
	const { dashboard, documents, runs } = Route.useLoaderData();
	return (
		<DashboardPage dashboard={dashboard} documents={documents} runs={runs} />
	);
}
