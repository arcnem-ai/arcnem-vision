import { useNavigate } from "@tanstack/react-router";
import {
	Activity,
	Archive,
	FileImage,
	MonitorSmartphone,
	Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	type DashboardTab,
	isDashboardTab,
} from "@/features/dashboard/dashboard-navigation";
import type { DashboardWorkflowLibraryController } from "@/features/dashboard/dashboard-page-controller.types";
import type { DashboardData } from "@/features/dashboard/types";
import { DocumentGalleryPanel } from "@/features/documents/components/document-gallery-panel";
import type { DocumentsResponse } from "@/features/documents/types";
import { RunsPanel } from "@/features/runs/components/runs-panel";
import type { RunsResponse } from "@/features/runs/types";
import { DashboardEmptyOrgCard } from "./dashboard-empty-org-card";
import { ProjectAPIKeysPanel } from "./project-api-keys-panel";
import { WorkflowLibraryPanel } from "./workflow-library-panel";

export function DashboardWorkspaceTabs({
	dashboard,
	documents,
	runs,
	showArchived,
	activeTab,
	library,
}: {
	dashboard: DashboardData;
	documents: DocumentsResponse;
	runs: RunsResponse;
	showArchived: boolean;
	activeTab: DashboardTab;
	library: DashboardWorkflowLibraryController;
}) {
	const navigate = useNavigate({ from: "/" });

	return (
		<Tabs
			value={activeTab}
			onValueChange={(nextTab) => {
				if (!isDashboardTab(nextTab) || nextTab === activeTab) {
					return;
				}
				void navigate({
					search: (prev) => ({
						...prev,
						tab: nextTab,
					}),
					resetScroll: false,
				});
			}}
			className="w-full"
		>
			<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem] md:items-center">
				<TabsList className="min-w-0 w-full justify-start gap-1 rounded-xl border border-slate-200/60 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
					<TabsTrigger
						value="project-view"
						className="gap-1.5 rounded-lg text-xs sm:text-sm"
					>
						<MonitorSmartphone className="size-3.5" />
						<span className="hidden sm:inline">Projects &</span> API Keys
					</TabsTrigger>
					<TabsTrigger
						value="workflow-view"
						className="gap-1.5 rounded-lg text-xs sm:text-sm"
					>
						<Workflow className="size-3.5" />
						<span className="hidden sm:inline">Workflow</span>
						<span className="sm:hidden">Flows</span>
						<span className="hidden sm:inline">Library</span>
					</TabsTrigger>
					<TabsTrigger
						value="documents-view"
						className="gap-1.5 rounded-lg text-xs sm:text-sm"
					>
						<FileImage className="size-3.5" />
						Docs
					</TabsTrigger>
					<TabsTrigger
						value="runs-view"
						className="gap-1.5 rounded-lg text-xs sm:text-sm"
					>
						<Activity className="size-3.5" />
						Runs
					</TabsTrigger>
				</TabsList>
				<Button
					type="button"
					variant="outline"
					className="w-full justify-center rounded-full bg-white/85 whitespace-nowrap md:w-44"
					onClick={() =>
						void navigate({
							search: (prev) => ({
								...prev,
								showArchived: !prev.showArchived,
							}),
							resetScroll: false,
						})
					}
				>
					<Archive className="mr-2 size-4" />
					{showArchived ? "Hide archived" : "Show archived"}
				</Button>
			</div>

			<TabsContent value="project-view" className="mt-4">
				<ProjectAPIKeysPanel
					dashboard={dashboard}
					showArchived={showArchived}
				/>
			</TabsContent>

			<TabsContent value="workflow-view" className="mt-4">
				<WorkflowLibraryPanel
					workflowTemplates={dashboard.workflowTemplates}
					workflows={dashboard.workflows}
					showArchived={showArchived}
					startingTemplateId={library.startingTemplateId}
					savingTemplateFromWorkflowId={library.savingTemplateFromWorkflowId}
					generatingWorkflowDraft={library.generatingWorkflowDraft}
					settingWorkflowArchiveId={library.settingWorkflowArchiveId}
					settingTemplateArchiveId={library.settingTemplateArchiveId}
					onOpenCreate={library.onOpenCreate}
					onOpenEdit={library.onOpenEdit}
					onOpenEditTemplate={library.onOpenEditTemplate}
					onGenerateDraft={library.onGenerateDraft}
					onCreateTemplateFromWorkflow={library.onCreateTemplateFromWorkflow}
					onStartFromTemplate={library.onStartFromTemplate}
					onToggleWorkflowArchive={library.onToggleWorkflowArchive}
					onToggleTemplateArchive={library.onToggleTemplateArchive}
				/>
			</TabsContent>

			<TabsContent value="documents-view" className="mt-4">
				{dashboard.organization ? (
					<DocumentGalleryPanel
						initialData={documents}
						organizationId={dashboard.organization.id}
						organizationName={dashboard.organization.name}
						projects={dashboard.projects}
						workflowApiKeys={dashboard.workflowApiKeys}
						serviceApiKeys={dashboard.serviceApiKeys}
						workflows={dashboard.workflows}
					/>
				) : (
					<DashboardEmptyOrgCard message="Set up an organization to view documents." />
				)}
			</TabsContent>

			<TabsContent value="runs-view" className="mt-4">
				{dashboard.organization ? (
					<RunsPanel
						initialData={runs}
						organizationId={dashboard.organization.id}
					/>
				) : (
					<DashboardEmptyOrgCard message="Set up an organization to view runs." />
				)}
			</TabsContent>
		</Tabs>
	);
}
