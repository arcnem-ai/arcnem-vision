import { Activity, FileImage, MonitorSmartphone, Workflow } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
	library,
}: {
	dashboard: DashboardData;
	documents: DocumentsResponse;
	runs: RunsResponse;
	showArchived: boolean;
	library: DashboardWorkflowLibraryController;
}) {
	return (
		<Tabs defaultValue="project-view" className="w-full">
			<TabsList className="w-full justify-start gap-1 rounded-xl border border-slate-200/60 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
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
					startingTemplateId={library.startingTemplateId}
					savingTemplateFromWorkflowId={library.savingTemplateFromWorkflowId}
					onOpenCreate={library.onOpenCreate}
					onOpenEdit={library.onOpenEdit}
					onOpenEditTemplate={library.onOpenEditTemplate}
					onCreateTemplateFromWorkflow={library.onCreateTemplateFromWorkflow}
					onStartFromTemplate={library.onStartFromTemplate}
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
