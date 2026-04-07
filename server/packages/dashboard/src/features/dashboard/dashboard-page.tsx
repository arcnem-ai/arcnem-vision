import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Activity,
	Building2,
	FileImage,
	MonitorSmartphone,
	Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardAuthCard } from "@/features/dashboard/components/dashboard-auth-card";
import { DashboardCreateOrganizationCard } from "@/features/dashboard/components/dashboard-create-organization-card";
import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { DashboardSessionToolbar } from "@/features/dashboard/components/dashboard-session-toolbar";
import { ProjectDevicePanel } from "@/features/dashboard/components/project-device-panel";
import { WorkflowCanvasEditor } from "@/features/dashboard/components/workflow-canvas-editor";
import { WorkflowLibraryPanel } from "@/features/dashboard/components/workflow-library-panel";
import {
	createWorkflow,
	createWorkflowFromTemplate,
	createWorkflowTemplateFromWorkflow,
	updateWorkflow,
	updateWorkflowTemplate,
} from "@/features/dashboard/server-fns";
import type {
	DashboardData,
	StatusMessage,
	WorkflowDraft,
	WorkflowTemplateDraft,
} from "@/features/dashboard/types";
import { DocumentGalleryPanel } from "@/features/documents/components/document-gallery-panel";
import type { DocumentsResponse } from "@/features/documents/types";
import { DashboardRealtimeProvider } from "@/features/realtime/dashboard-realtime-provider";
import { RunsPanel } from "@/features/runs/components/runs-panel";
import type { RunsResponse } from "@/features/runs/types";

function EmptyOrgCard({ message }: { message: string }) {
	return (
		<Card className="border-slate-200/60 bg-white/80 py-16 text-center shadow-sm">
			<CardContent>
				<div className="flex flex-col items-center gap-3">
					<div className="rounded-2xl bg-slate-100 p-4">
						<Building2 className="size-8 text-slate-300" />
					</div>
					<div>
						<p className="font-medium text-slate-500">
							No organization selected
						</p>
						<p className="mt-1 text-sm text-muted-foreground">{message}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

type CanvasTarget =
	| { kind: "workflow-create" }
	| { kind: "workflow"; id: string }
	| { kind: "template"; id: string }
	| null;

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
	const router = useRouter();
	const createWorkflowFn = useServerFn(createWorkflow);
	const createWorkflowFromTemplateFn = useServerFn(createWorkflowFromTemplate);
	const createWorkflowTemplateFromWorkflowFn = useServerFn(
		createWorkflowTemplateFromWorkflow,
	);
	const updateWorkflowFn = useServerFn(updateWorkflow);
	const updateWorkflowTemplateFn = useServerFn(updateWorkflowTemplate);

	const [creatingWorkflow, setCreatingWorkflow] = useState(false);
	const [startingTemplateId, setStartingTemplateId] = useState<string | null>(
		null,
	);
	const [savingTemplateFromWorkflowId, setSavingTemplateFromWorkflowId] =
		useState<string | null>(null);
	const [updatingWorkflowId, setUpdatingWorkflowId] = useState<string | null>(
		null,
	);
	const [updatingTemplateId, setUpdatingTemplateId] = useState<string | null>(
		null,
	);
	const [editorMessage, setEditorMessage] = useState<StatusMessage | null>(
		null,
	);
	const [canvasTarget, setCanvasTarget] = useState<CanvasTarget>(null);
	const [pendingCanvasTarget, setPendingCanvasTarget] =
		useState<CanvasTarget>(null);

	const createWorkflowDraft = async (draft: WorkflowDraft) => {
		setCreatingWorkflow(true);
		setEditorMessage(null);
		try {
			await createWorkflowFn({
				data: {
					name: draft.name,
					description: draft.description,
					entryNode: draft.entryNode,
					nodes: draft.nodes,
					edges: draft.edges,
				},
			});
			setEditorMessage({
				tone: "success",
				text: "Workflow created. It is now ready for node and edge edits.",
			});
			await router.invalidate();
		} catch (error) {
			setEditorMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to create workflow.",
			});
			throw error;
		} finally {
			setCreatingWorkflow(false);
		}
	};

	const updateWorkflowDraft = async (
		workflowId: string,
		draft: WorkflowDraft,
	) => {
		setUpdatingWorkflowId(workflowId);
		setEditorMessage(null);
		try {
			await updateWorkflowFn({
				data: {
					workflowId,
					name: draft.name,
					description: draft.description,
					entryNode: draft.entryNode,
					nodes: draft.nodes,
					edges: draft.edges,
				},
			});
			setEditorMessage({
				tone: "success",
				text: "Workflow metadata updated.",
			});
			await router.invalidate();
		} catch (error) {
			setEditorMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to update workflow.",
			});
			throw error;
		} finally {
			setUpdatingWorkflowId(null);
		}
	};

	const createTemplateFromWorkflow = async (
		workflowId: string,
		templateDraft: Pick<
			WorkflowTemplateDraft,
			"name" | "description" | "visibility"
		>,
	) => {
		setSavingTemplateFromWorkflowId(workflowId);
		try {
			const template = await createWorkflowTemplateFromWorkflowFn({
				data: {
					workflowId,
					name: templateDraft.name,
					description: templateDraft.description,
					visibility: templateDraft.visibility,
				},
			});
			await router.invalidate();
			return template;
		} finally {
			setSavingTemplateFromWorkflowId(null);
		}
	};

	const updateTemplateDraft = async (
		templateId: string,
		draft: WorkflowTemplateDraft,
	) => {
		setUpdatingTemplateId(templateId);
		setEditorMessage(null);
		try {
			const template = await updateWorkflowTemplateFn({
				data: {
					templateId,
					name: draft.name,
					description: draft.description,
					entryNode: draft.entryNode,
					visibility: draft.visibility,
					nodes: draft.nodes,
					edges: draft.edges,
				},
			});
			setEditorMessage({
				tone: "success",
				text: `Published template version ${template.version}.`,
			});
			await router.invalidate();
		} catch (error) {
			setEditorMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to update template.",
			});
			throw error;
		} finally {
			setUpdatingTemplateId(null);
		}
	};

	useEffect(() => {
		if (
			!pendingCanvasTarget ||
			pendingCanvasTarget.kind === "workflow-create"
		) {
			return;
		}

		const exists =
			pendingCanvasTarget.kind === "workflow"
				? dashboard.workflows.some(
						(workflow) => workflow.id === pendingCanvasTarget.id,
					)
				: dashboard.workflowTemplates.some(
						(template) => template.id === pendingCanvasTarget.id,
					);
		if (!exists) {
			return;
		}

		setCanvasTarget(pendingCanvasTarget);
		setPendingCanvasTarget(null);
	}, [dashboard.workflowTemplates, dashboard.workflows, pendingCanvasTarget]);

	const startWorkflowFromTemplate = async (templateId: string) => {
		setStartingTemplateId(templateId);
		try {
			const workflow = await createWorkflowFromTemplateFn({
				data: {
					templateId,
				},
			});
			setPendingCanvasTarget({
				kind: "workflow",
				id: workflow.id,
			});
			await router.invalidate();
		} finally {
			setStartingTemplateId(null);
		}
	};

	const activeCanvasWorkflow =
		canvasTarget?.kind === "workflow"
			? (dashboard.workflows.find(
					(workflow) => workflow.id === canvasTarget.id,
				) ?? null)
			: null;
	const activeCanvasTemplate =
		canvasTarget?.kind === "template"
			? (dashboard.workflowTemplates.find(
					(template) => template.id === canvasTarget.id,
				) ?? null)
			: null;
	const isCanvasOpen = canvasTarget !== null;
	const hasOrganizations = dashboard.organizations.length > 0;
	const showWorkspace = dashboard.auth.state === "ready" && hasOrganizations;
	const showCreateOrganization =
		dashboard.auth.state === "ready" && !hasOrganizations;

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

							{showCreateOrganization ? (
								<DashboardCreateOrganizationCard
									userEmail={dashboard.auth.userEmail}
									organizationCreationEnabled={
										dashboard.auth.organizationCreationEnabled
									}
								/>
							) : null}

							{showWorkspace ? (
								<Tabs defaultValue="project-view" className="w-full">
									<TabsList className="w-full justify-start gap-1 rounded-xl border border-slate-200/60 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
										<TabsTrigger
											value="project-view"
											className="gap-1.5 rounded-lg text-xs sm:text-sm"
										>
											<MonitorSmartphone className="size-3.5" />
											<span className="hidden sm:inline">Projects &</span>{" "}
											Devices
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
										<ProjectDevicePanel
											dashboard={dashboard}
											showArchived={showArchived}
										/>
									</TabsContent>

									<TabsContent value="workflow-view" className="mt-4">
										<WorkflowLibraryPanel
											workflowTemplates={dashboard.workflowTemplates}
											workflows={dashboard.workflows}
											startingTemplateId={startingTemplateId}
											savingTemplateFromWorkflowId={
												savingTemplateFromWorkflowId
											}
											onOpenCreate={() => {
												setCanvasTarget({
													kind: "workflow-create",
												});
												setPendingCanvasTarget(null);
												setEditorMessage(null);
											}}
											onOpenEdit={(workflow) => {
												setCanvasTarget({
													kind: "workflow",
													id: workflow.id,
												});
												setPendingCanvasTarget(null);
												setEditorMessage(null);
											}}
											onOpenEditTemplate={(template) => {
												setCanvasTarget({
													kind: "template",
													id: template.id,
												});
												setPendingCanvasTarget(null);
												setEditorMessage(null);
											}}
											onCreateTemplateFromWorkflow={(workflow, templateDraft) =>
												createTemplateFromWorkflow(workflow.id, templateDraft)
											}
											onStartFromTemplate={(template) =>
												startWorkflowFromTemplate(template.id)
											}
										/>
									</TabsContent>

									<TabsContent value="documents-view" className="mt-4">
										{dashboard.organization ? (
											<DocumentGalleryPanel
												initialData={documents}
												organizationId={dashboard.organization.id}
												organizationName={dashboard.organization.name}
												projects={dashboard.projects}
												devices={dashboard.devices}
												workflows={dashboard.workflows}
											/>
										) : (
											<EmptyOrgCard message="Set up an organization to view documents." />
										)}
									</TabsContent>
									<TabsContent value="runs-view" className="mt-4">
										{dashboard.organization ? (
											<RunsPanel
												initialData={runs}
												organizationId={dashboard.organization.id}
											/>
										) : (
											<EmptyOrgCard message="Set up an organization to view runs." />
										)}
									</TabsContent>
								</Tabs>
							) : null}
						</>
					)}
				</main>

				<WorkflowCanvasEditor
					isOpen={showWorkspace ? isCanvasOpen : false}
					mode={
						canvasTarget?.kind === "template"
							? "template-edit"
							: canvasTarget?.kind === "workflow"
								? "workflow-edit"
								: "workflow-create"
					}
					workflow={
						canvasTarget?.kind === "workflow" ? activeCanvasWorkflow : null
					}
					template={
						canvasTarget?.kind === "template" ? activeCanvasTemplate : null
					}
					modelCatalog={dashboard.modelCatalog}
					toolCatalog={dashboard.toolCatalog}
					saveMessage={editorMessage}
					creatingWorkflow={creatingWorkflow}
					updatingWorkflowId={updatingWorkflowId}
					updatingTemplateId={updatingTemplateId}
					onClose={() => {
						setCanvasTarget(null);
					}}
					onCreateWorkflow={createWorkflowDraft}
					onUpdateWorkflow={updateWorkflowDraft}
					onUpdateTemplate={updateTemplateDraft}
				/>
			</div>
		</DashboardRealtimeProvider>
	);
}
