import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { getDashboardData } from "@/features/dashboard/server-fns";
import { getDocuments } from "@/features/documents/server/documents-data";
import { getAgentGraphRuns } from "@/features/runs/server/runs-data";

type DashboardSearch = {
	showArchived?: boolean;
};

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
		showArchived:
			search.showArchived === true || search.showArchived === "true",
	}),
	loaderDeps: ({ search }) => ({
		showArchived: search.showArchived ?? false,
	}),
	component: DashboardRoute,
	loader: async ({ deps }) => {
		let forwardedHeaders: HeadersInit | undefined;
		if (typeof document === "undefined") {
			const { getRequestHeader } = await import("@tanstack/react-start/server");
			const cookieHeader = getRequestHeader("cookie");
			if (cookieHeader) {
				forwardedHeaders = {
					cookie: cookieHeader,
				};
			}
		}

		const dashboard = await getDashboardData({
			data: {
				includeArchived: deps.showArchived,
			},
			headers: forwardedHeaders,
		});

		let documents = { documents: [], nextCursor: null } as Awaited<
			ReturnType<typeof getDocuments>
		>;
		let runs = { runs: [], nextCursor: null } as Awaited<
			ReturnType<typeof getAgentGraphRuns>
		>;
		if (dashboard.organization) {
			const orgId = dashboard.organization.id;
			const [docsResult, runsResult] = await Promise.allSettled([
				getDocuments({
					data: { organizationId: orgId },
					headers: forwardedHeaders,
				}),
				getAgentGraphRuns({
					data: { organizationId: orgId },
					headers: forwardedHeaders,
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
			showArchived={search.showArchived ?? false}
		/>
	);
}
