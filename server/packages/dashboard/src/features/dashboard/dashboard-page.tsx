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
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { ProjectDevicePanel } from "@/features/dashboard/components/project-device-panel";
import { WorkflowCanvasEditor } from "@/features/dashboard/components/workflow-canvas-editor";
import { WorkflowLibraryPanel } from "@/features/dashboard/components/workflow-library-panel";
import {
	assignWorkflowToDevice,
	createWorkflow,
	updateWorkflow,
} from "@/features/dashboard/server-fns";
import type {
	DashboardData,
	StatusMessage,
	WorkflowDraft,
} from "@/features/dashboard/types";
import { DocumentGalleryPanel } from "@/features/documents/components/document-gallery-panel";
import type { DocumentsResponse } from "@/features/documents/types";
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

export function DashboardPage({
	dashboard,
	documents,
	runs,
}: {
	dashboard: DashboardData;
	documents: DocumentsResponse;
	runs: RunsResponse;
}) {
	const router = useRouter();
	const assignWorkflow = useServerFn(assignWorkflowToDevice);
	const createWorkflowFn = useServerFn(createWorkflow);
	const updateWorkflowFn = useServerFn(updateWorkflow);

	const [selectedProjectId, setSelectedProjectId] = useState(
		dashboard.projects[0]?.id ?? "",
	);
	const [selectedByDevice, setSelectedByDevice] = useState<
		Record<string, string>
	>(
		Object.fromEntries(
			dashboard.devices.map((device) => [device.id, device.agentGraphId]),
		),
	);

	const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
	const [assignMessage, setAssignMessage] = useState<StatusMessage | null>(
		null,
	);

	const [creatingWorkflow, setCreatingWorkflow] = useState(false);
	const [updatingWorkflowId, setUpdatingWorkflowId] = useState<string | null>(
		null,
	);
	const [workflowMessage, setWorkflowMessage] = useState<StatusMessage | null>(
		null,
	);
	const [canvasCreateMode, setCanvasCreateMode] = useState(false);
	const [canvasWorkflowId, setCanvasWorkflowId] = useState<string | null>(null);

	useEffect(() => {
		setSelectedByDevice(
			Object.fromEntries(
				dashboard.devices.map((device) => [device.id, device.agentGraphId]),
			),
		);
		if (
			!dashboard.projects.some((project) => project.id === selectedProjectId)
		) {
			setSelectedProjectId(dashboard.projects[0]?.id ?? "");
		}
	}, [dashboard.devices, dashboard.projects, selectedProjectId]);

	const assignToDevice = async (deviceId: string) => {
		setSavingDeviceId(deviceId);
		setAssignMessage(null);
		try {
			const selectedWorkflowId = selectedByDevice[deviceId];
			if (!selectedWorkflowId) {
				throw new Error("Select a workflow before applying.");
			}
			await assignWorkflow({
				data: {
					deviceId,
					agentGraphId: selectedWorkflowId,
				},
			});
			setAssignMessage({ tone: "success", text: "Workflow updated." });
			await router.invalidate();
		} catch (error) {
			setAssignMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to update workflow.",
			});
		} finally {
			setSavingDeviceId(null);
		}
	};

	const createWorkflowDraft = async (draft: WorkflowDraft) => {
		setCreatingWorkflow(true);
		setWorkflowMessage(null);
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
			setWorkflowMessage({
				tone: "success",
				text: "Workflow created. It is now ready for node and edge edits.",
			});
			await router.invalidate();
		} catch (error) {
			setWorkflowMessage({
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
		setWorkflowMessage(null);
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
			setWorkflowMessage({
				tone: "success",
				text: "Workflow metadata updated.",
			});
			await router.invalidate();
		} catch (error) {
			setWorkflowMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to update workflow.",
			});
			throw error;
		} finally {
			setUpdatingWorkflowId(null);
		}
	};

	const activeCanvasWorkflow = canvasWorkflowId
		? (dashboard.workflows.find(
				(workflow) => workflow.id === canvasWorkflowId,
			) ?? null)
		: null;
	const isCanvasOpen = canvasCreateMode || canvasWorkflowId !== null;

	return (
		<div className="relative isolate min-h-screen text-foreground">
			<div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,#fff9ef_0%,#fff_40%,#f6fbff_100%)]" />
			<div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_10%,rgba(249,168,37,0.15),transparent_35%),radial-gradient(circle_at_85%_8%,rgba(14,165,233,0.18),transparent_33%),radial-gradient(circle_at_75%_72%,rgba(34,197,94,0.14),transparent_38%)]" />
			<div className="pointer-events-none fixed inset-0 -z-10 opacity-20 bg-[linear-gradient(rgba(30,41,59,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(30,41,59,0.06)_1px,transparent_1px)] bg-size-[44px_44px]" />

			<main className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
				<DashboardHeader />

				{dashboard.auth.state === "missing" ? (
					<Card className="border-amber-300 bg-amber-50/90 shadow-sm">
						<CardHeader>
							<CardTitle className="font-display text-xl">
								No active session found
							</CardTitle>
							<CardDescription>
								Seed the database to create a local dashboard session, then set
								cookie{" "}
								<code className="rounded bg-amber-100 px-1">
									better-auth.session_token
								</code>
								. You can also set{" "}
								<code className="rounded bg-amber-100 px-1">
									DASHBOARD_SESSION_TOKEN
								</code>
								.
							</CardDescription>
						</CardHeader>
					</Card>
				) : null}

				<Tabs defaultValue="project-view" className="w-full">
					<TabsList className="w-full justify-start gap-1 rounded-xl border border-slate-200/60 bg-white/80 p-1 shadow-sm backdrop-blur-sm">
						<TabsTrigger
							value="project-view"
							className="gap-1.5 rounded-lg text-xs sm:text-sm"
						>
							<MonitorSmartphone className="size-3.5" />
							<span className="hidden sm:inline">Projects &</span> Devices
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
							selectedProjectId={selectedProjectId}
							selectedByDevice={selectedByDevice}
							onSelectProject={setSelectedProjectId}
							onSelectDeviceWorkflow={(deviceId, workflowId) =>
								setSelectedByDevice((previous) => ({
									...previous,
									[deviceId]: workflowId,
								}))
							}
							onAssignToDevice={assignToDevice}
							savingDeviceId={savingDeviceId}
							saveMessage={assignMessage}
						/>
					</TabsContent>

					<TabsContent value="workflow-view" className="mt-4">
						<WorkflowLibraryPanel
							workflows={dashboard.workflows}
							onOpenCreate={() => {
								setCanvasCreateMode(true);
								setCanvasWorkflowId(null);
								setWorkflowMessage(null);
							}}
							onOpenEdit={(workflow) => {
								setCanvasCreateMode(false);
								setCanvasWorkflowId(workflow.id);
								setWorkflowMessage(null);
							}}
						/>
					</TabsContent>

					<TabsContent value="documents-view" className="mt-4">
						{dashboard.organization ? (
							<DocumentGalleryPanel
								initialData={documents}
								organizationId={dashboard.organization.id}
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
			</main>

			<WorkflowCanvasEditor
				isOpen={isCanvasOpen}
				workflow={canvasCreateMode ? null : activeCanvasWorkflow}
				modelCatalog={dashboard.modelCatalog}
				toolCatalog={dashboard.toolCatalog}
				saveMessage={workflowMessage}
				creatingWorkflow={creatingWorkflow}
				updatingWorkflowId={updatingWorkflowId}
				onClose={() => {
					setCanvasCreateMode(false);
					setCanvasWorkflowId(null);
				}}
				onCreateWorkflow={createWorkflowDraft}
				onUpdateWorkflow={updateWorkflowDraft}
			/>
		</div>
	);
}
