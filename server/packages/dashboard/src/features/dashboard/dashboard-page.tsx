import { DashboardAuthCard } from "@/features/dashboard/components/dashboard-auth-card";
import { DashboardCreateOrganizationCard } from "@/features/dashboard/components/dashboard-create-organization-card";
import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { DashboardSessionToolbar } from "@/features/dashboard/components/dashboard-session-toolbar";
import { DashboardWorkspaceTabs } from "@/features/dashboard/components/dashboard-workspace-tabs";
import { WorkflowCanvasEditor } from "@/features/dashboard/components/workflow-canvas-editor";
import { useDashboardPageController } from "@/features/dashboard/dashboard-page-controller";
import type { DashboardData } from "@/features/dashboard/types";
import type { DocumentsResponse } from "@/features/documents/types";
import { DashboardRealtimeProvider } from "@/features/realtime/dashboard-realtime-provider";
import type { RunsResponse } from "@/features/runs/types";

export function DashboardPage({
	dashboard,
	documents,
	runs,
	showArchived,
}: {
	dashboard: DashboardData;
	documents: DocumentsResponse;
	runs: RunsResponse;
	showArchived: boolean;
}) {
	const controller = useDashboardPageController(dashboard);

	return (
		<DashboardRealtimeProvider
			organizationId={dashboard.organization?.id ?? null}
		>
			<div className="relative isolate min-h-screen text-foreground">
				<div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,#fff9ef_0%,#fff_40%,#f6fbff_100%)]" />
				<div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_10%,rgba(249,168,37,0.15),transparent_35%),radial-gradient(circle_at_85%_8%,rgba(14,165,233,0.18),transparent_33%),radial-gradient(circle_at_75%_72%,rgba(34,197,94,0.14),transparent_38%)]" />
				<div className="pointer-events-none fixed inset-0 -z-10 opacity-20 bg-[linear-gradient(rgba(30,41,59,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,0.06)_1px,transparent_1px)] bg-size-[44px_44px]" />

				<main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
					<DashboardHeader />

					{dashboard.auth.state === "missing" ? (
						<DashboardAuthCard
							signUpEnabled={dashboard.auth.signUpEnabled}
							organizationCreationEnabled={
								dashboard.auth.organizationCreationEnabled
							}
							debugSessionBootstrapEnabled={
								dashboard.auth.debugSessionBootstrapEnabled
							}
						/>
					) : (
						<>
							<DashboardSessionToolbar
								auth={dashboard.auth}
								organizations={dashboard.organizations}
								currentOrganizationId={dashboard.organization?.id ?? null}
							/>

							{controller.showCreateOrganization ? (
								<DashboardCreateOrganizationCard
									userEmail={dashboard.auth.userEmail}
									organizationCreationEnabled={
										dashboard.auth.organizationCreationEnabled
									}
								/>
							) : null}

							{controller.showWorkspace ? (
								<DashboardWorkspaceTabs
									dashboard={dashboard}
									documents={documents}
									runs={runs}
									showArchived={showArchived}
									library={controller.library}
								/>
							) : null}
						</>
					)}
				</main>

				<WorkflowCanvasEditor
					isOpen={controller.showWorkspace && controller.canvas.isOpen}
					mode={controller.canvas.mode}
					workflow={controller.canvas.workflow}
					template={controller.canvas.template}
					modelCatalog={dashboard.modelCatalog}
					toolCatalog={dashboard.toolCatalog}
					saveMessage={controller.canvas.saveMessage}
					creatingWorkflow={controller.canvas.creatingWorkflow}
					updatingWorkflowId={controller.canvas.updatingWorkflowId}
					updatingTemplateId={controller.canvas.updatingTemplateId}
					onClose={controller.canvas.onClose}
					onCreateWorkflow={controller.canvas.onCreateWorkflow}
					onUpdateWorkflow={controller.canvas.onUpdateWorkflow}
					onUpdateTemplate={controller.canvas.onUpdateTemplate}
				/>
			</div>
		</DashboardRealtimeProvider>
	);
}
