"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Archive,
	Copy,
	FolderPlus,
	KeyRound,
	Shield,
	Workflow,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
	createProject,
	createServiceAPIKey,
	createWorkflowAPIKey,
	setProjectArchived,
	updateServiceAPIKey,
	updateWorkflowAPIKey,
} from "@/features/dashboard/server-fns";
import type {
	DashboardData,
	GeneratedAPIKey,
	ServiceAPIKey,
	StatusMessage,
	WorkflowAPIKey,
} from "@/features/dashboard/types";
import { cn } from "@/lib/utils";

type WorkflowKeyDraft = {
	name: string;
	enabled: boolean;
	agentGraphId: string;
};

type ServiceKeyDraft = {
	name: string;
	enabled: boolean;
};

function relativeTime(iso: string | null): string {
	if (!iso) return "never used";

	const diff = Date.now() - new Date(iso).getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function formatDateTime(iso: string | null): string {
	if (!iso) return "Never";
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatRateLimit(
	max: number,
	windowMs: number,
	enabled: boolean,
): string {
	if (!enabled) return "Unlimited";

	const minutes = Math.round(windowMs / 60_000);
	if (minutes >= 1_440 && minutes % 1_440 === 0) {
		return `${max.toLocaleString()} / ${minutes / 1_440}d`;
	}
	if (minutes >= 60 && minutes % 60 === 0) {
		return `${max.toLocaleString()} / ${minutes / 60}h`;
	}
	return `${max.toLocaleString()} / ${minutes}m`;
}

function formatKeyLabel(
	start: string | null,
	prefix: string | null,
	id: string,
): string {
	return start ?? prefix ?? id.slice(0, 8);
}

function StatusNotice({ message }: { message: StatusMessage }) {
	return (
		<div
			role={message.tone === "error" ? "alert" : "status"}
			className={cn(
				"rounded-xl border px-3 py-2 text-sm",
				message.tone === "success"
					? "border-emerald-200 bg-emerald-50 text-emerald-800"
					: "border-rose-200 bg-rose-50 text-rose-800",
			)}
		>
			{message.text}
		</div>
	);
}

function GeneratedKeyCard({
	revealedKey,
	label,
	copiedKeyId,
	onCopy,
}: {
	revealedKey: GeneratedAPIKey;
	label: string | null;
	copiedKeyId: string | null;
	onCopy: (key: GeneratedAPIKey) => Promise<void>;
}) {
	return (
		<Card className="border-emerald-200/80 bg-emerald-50/80 shadow-sm">
			<CardHeader className="gap-2">
				<div className="flex items-center gap-2">
					<KeyRound className="size-4 text-emerald-700" />
					<CardTitle className="text-base text-emerald-950">
						New API key ready
					</CardTitle>
				</div>
				<CardDescription className="text-emerald-900/75">
					{label
						? `${label} has been created. Copy the secret now because it will not be shown again.`
						: "Copy the secret now because it will not be shown again."}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="rounded-2xl border border-emerald-200 bg-white/90 p-3">
					<p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700/80">
						Secret
					</p>
					<code className="mt-2 block overflow-x-auto text-sm text-slate-900">
						{revealedKey.value}
					</code>
				</div>
				<div className="flex flex-wrap gap-2">
					<Badge variant="outline" className="rounded-full bg-white/80">
						Label: {revealedKey.name ?? "Untitled"}
					</Badge>
					<Badge variant="outline" className="rounded-full bg-white/80">
						Public id:{" "}
						{formatKeyLabel(
							revealedKey.start,
							revealedKey.prefix,
							revealedKey.id,
						)}
					</Badge>
				</div>
				<Button
					type="button"
					variant="outline"
					onClick={() => void onCopy(revealedKey)}
					className="rounded-full border-emerald-300 bg-white"
				>
					<Copy className="mr-2 size-4" />
					{copiedKeyId === revealedKey.id ? "Copied" : "Copy secret"}
				</Button>
			</CardContent>
		</Card>
	);
}

function KeyMetaRow({
	requestCount,
	lastRequest,
	expiresAt,
	rateLimitEnabled,
	rateLimitMax,
	rateLimitTimeWindow,
}: Pick<
	WorkflowAPIKey,
	| "requestCount"
	| "lastRequest"
	| "expiresAt"
	| "rateLimitEnabled"
	| "rateLimitMax"
	| "rateLimitTimeWindow"
>) {
	return (
		<div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
			<p>
				<span className="font-medium text-slate-700">{requestCount}</span>{" "}
				requests
			</p>
			<p>Last used {relativeTime(lastRequest)}</p>
			<p>
				Rate limit{" "}
				<span className="font-medium text-slate-700">
					{formatRateLimit(rateLimitMax, rateLimitTimeWindow, rateLimitEnabled)}
				</span>
			</p>
			<p>Expires {formatDateTime(expiresAt)}</p>
		</div>
	);
}

export function ProjectAPIKeysPanel({
	dashboard,
	showArchived,
}: {
	dashboard: DashboardData;
	showArchived: boolean;
}) {
	const router = useRouter();
	const createProjectFn = useServerFn(createProject);
	const createWorkflowAPIKeyFn = useServerFn(createWorkflowAPIKey);
	const updateWorkflowAPIKeyFn = useServerFn(updateWorkflowAPIKey);
	const createServiceAPIKeyFn = useServerFn(createServiceAPIKey);
	const updateServiceAPIKeyFn = useServerFn(updateServiceAPIKey);
	const setProjectArchivedFn = useServerFn(setProjectArchived);

	const [selectedProjectId, setSelectedProjectId] = useState(
		dashboard.projects[0]?.id ?? "",
	);
	const [newProjectName, setNewProjectName] = useState("");
	const [newWorkflowKeyName, setNewWorkflowKeyName] = useState("");
	const [newWorkflowKeyWorkflowId, setNewWorkflowKeyWorkflowId] = useState(
		dashboard.workflows[0]?.id ?? "",
	);
	const [newServiceKeyName, setNewServiceKeyName] = useState("");
	const [workflowKeyDrafts, setWorkflowKeyDrafts] = useState<
		Record<string, WorkflowKeyDraft>
	>({});
	const [serviceKeyDrafts, setServiceKeyDrafts] = useState<
		Record<string, ServiceKeyDraft>
	>({});
	const [panelMessage, setPanelMessage] = useState<StatusMessage | null>(null);
	const [revealedKey, setRevealedKey] = useState<GeneratedAPIKey | null>(null);
	const [revealedKeyLabel, setRevealedKeyLabel] = useState<string | null>(null);
	const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

	const [creatingProject, setCreatingProject] = useState(false);
	const [creatingWorkflowKey, setCreatingWorkflowKey] = useState(false);
	const [creatingServiceKey, setCreatingServiceKey] = useState(false);
	const [savingWorkflowKeyId, setSavingWorkflowKeyId] = useState<string | null>(
		null,
	);
	const [savingServiceKeyId, setSavingServiceKeyId] = useState<string | null>(
		null,
	);
	const [settingProjectArchiveId, setSettingProjectArchiveId] = useState<
		string | null
	>(null);

	useEffect(() => {
		setSelectedProjectId((current) =>
			dashboard.projects.some((project) => project.id === current)
				? current
				: (dashboard.projects[0]?.id ?? ""),
		);
		setNewWorkflowKeyWorkflowId((current) =>
			dashboard.workflows.some((workflow) => workflow.id === current)
				? current
				: (dashboard.workflows[0]?.id ?? ""),
		);
		setWorkflowKeyDrafts(
			Object.fromEntries(
				dashboard.workflowApiKeys.map((apiKey) => [
					apiKey.id,
					{
						name: apiKey.name ?? "",
						enabled: apiKey.enabled,
						agentGraphId: apiKey.agentGraphId,
					},
				]),
			),
		);
		setServiceKeyDrafts(
			Object.fromEntries(
				dashboard.serviceApiKeys.map((apiKey) => [
					apiKey.id,
					{
						name: apiKey.name ?? "",
						enabled: apiKey.enabled,
					},
				]),
			),
		);
	}, [
		dashboard.projects,
		dashboard.serviceApiKeys,
		dashboard.workflowApiKeys,
		dashboard.workflows,
	]);

	useEffect(() => {
		if (!revealedKey) {
			return;
		}

		const stillVisible =
			dashboard.workflowApiKeys.some(
				(apiKey) => apiKey.id === revealedKey.id,
			) ||
			dashboard.serviceApiKeys.some((apiKey) => apiKey.id === revealedKey.id);
		if (!stillVisible) {
			setRevealedKey(null);
			setRevealedKeyLabel(null);
		}
	}, [dashboard.serviceApiKeys, dashboard.workflowApiKeys, revealedKey]);

	const selectedProject =
		dashboard.projects.find((project) => project.id === selectedProjectId) ??
		null;
	const workflowNameById = useMemo(
		() =>
			new Map(
				dashboard.workflows.map((workflow) => [workflow.id, workflow.name]),
			),
		[dashboard.workflows],
	);
	const isSelectedProjectArchived = Boolean(selectedProject?.archivedAt);
	const workflowKeysForProject = useMemo(
		() =>
			dashboard.workflowApiKeys.filter(
				(apiKey) => apiKey.projectId === selectedProjectId,
			),
		[dashboard.workflowApiKeys, selectedProjectId],
	);
	const serviceKeysForProject = useMemo(
		() =>
			dashboard.serviceApiKeys.filter(
				(apiKey) => apiKey.projectId === selectedProjectId,
			),
		[dashboard.serviceApiKeys, selectedProjectId],
	);

	const copySecret = async (apiKey: GeneratedAPIKey) => {
		try {
			await navigator.clipboard.writeText(apiKey.value);
			setCopiedKeyId(apiKey.id);
			window.setTimeout(() => {
				setCopiedKeyId((current) => (current === apiKey.id ? null : current));
			}, 2_000);
		} catch {
			setPanelMessage({
				tone: "error",
				text: "Unable to copy the API key secret from this browser.",
			});
		}
	};

	const refresh = async () => {
		await router.invalidate();
	};

	const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = newProjectName.trim();
		if (!name) {
			setPanelMessage({
				tone: "error",
				text: "Enter a project name first.",
			});
			return;
		}

		setCreatingProject(true);
		setPanelMessage(null);
		try {
			const project = await createProjectFn({
				data: { name },
			});
			setNewProjectName("");
			setSelectedProjectId(project.id);
			setPanelMessage({
				tone: "success",
				text: `${project.name} is ready for workflow and service keys.`,
			});
			await refresh();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to create project.",
			});
		} finally {
			setCreatingProject(false);
		}
	};

	const handleToggleProjectArchive = async () => {
		if (!selectedProject) {
			return;
		}

		setSettingProjectArchiveId(selectedProject.id);
		setPanelMessage(null);
		try {
			await setProjectArchivedFn({
				data: {
					projectId: selectedProject.id,
					archived: !selectedProject.archivedAt,
				},
			});
			setPanelMessage({
				tone: "success",
				text: selectedProject.archivedAt
					? `${selectedProject.name} restored.`
					: `${selectedProject.name} archived.`,
			});
			await refresh();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error
						? error.message
						: "Failed to update project archive state.",
			});
		} finally {
			setSettingProjectArchiveId(null);
		}
	};

	const handleCreateWorkflowKey = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedProject) {
			setPanelMessage({
				tone: "error",
				text: "Choose a project before creating a workflow key.",
			});
			return;
		}
		if (selectedProject.archivedAt) {
			setPanelMessage({
				tone: "error",
				text: "Restore this project before issuing new workflow keys.",
			});
			return;
		}
		const name = newWorkflowKeyName.trim();
		if (!name || !newWorkflowKeyWorkflowId) {
			setPanelMessage({
				tone: "error",
				text: "Add a key name and choose a workflow first.",
			});
			return;
		}

		setCreatingWorkflowKey(true);
		setPanelMessage(null);
		try {
			const createdKey = await createWorkflowAPIKeyFn({
				data: {
					projectId: selectedProject.id,
					name,
					agentGraphId: newWorkflowKeyWorkflowId,
				},
			});
			setNewWorkflowKeyName("");
			setRevealedKey(createdKey);
			setRevealedKeyLabel(selectedProject.name);
			setPanelMessage({
				tone: "success",
				text: `Workflow key ${createdKey.name ?? "Untitled"} created for ${selectedProject.name}.`,
			});
			await refresh();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error
						? error.message
						: "Failed to create workflow API key.",
			});
		} finally {
			setCreatingWorkflowKey(false);
		}
	};

	const handleCreateServiceKey = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedProject) {
			setPanelMessage({
				tone: "error",
				text: "Choose a project before creating a service key.",
			});
			return;
		}
		if (selectedProject.archivedAt) {
			setPanelMessage({
				tone: "error",
				text: "Restore this project before issuing new service keys.",
			});
			return;
		}
		const name = newServiceKeyName.trim();
		if (!name) {
			setPanelMessage({
				tone: "error",
				text: "Add a key name first.",
			});
			return;
		}

		setCreatingServiceKey(true);
		setPanelMessage(null);
		try {
			const createdKey = await createServiceAPIKeyFn({
				data: {
					projectId: selectedProject.id,
					name,
				},
			});
			setNewServiceKeyName("");
			setRevealedKey(createdKey);
			setRevealedKeyLabel(selectedProject.name);
			setPanelMessage({
				tone: "success",
				text: `Service key ${createdKey.name ?? "Untitled"} created for ${selectedProject.name}.`,
			});
			await refresh();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error
						? error.message
						: "Failed to create service API key.",
			});
		} finally {
			setCreatingServiceKey(false);
		}
	};

	const handleSaveWorkflowKey = async (apiKey: WorkflowAPIKey) => {
		const draft = workflowKeyDrafts[apiKey.id];
		if (!draft?.name.trim() || !draft?.agentGraphId) {
			setPanelMessage({
				tone: "error",
				text: "Workflow keys need a name and bound workflow.",
			});
			return;
		}

		setSavingWorkflowKeyId(apiKey.id);
		setPanelMessage(null);
		try {
			await updateWorkflowAPIKeyFn({
				data: {
					apiKeyId: apiKey.id,
					name: draft.name.trim(),
					enabled: draft.enabled,
					agentGraphId: draft.agentGraphId,
				},
			});
			setPanelMessage({
				tone: "success",
				text: `${draft.name.trim()} updated.`,
			});
			await refresh();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error
						? error.message
						: "Failed to update workflow API key.",
			});
		} finally {
			setSavingWorkflowKeyId(null);
		}
	};

	const handleSaveServiceKey = async (apiKey: ServiceAPIKey) => {
		const draft = serviceKeyDrafts[apiKey.id];
		if (!draft?.name.trim()) {
			setPanelMessage({
				tone: "error",
				text: "Service keys need a name.",
			});
			return;
		}

		setSavingServiceKeyId(apiKey.id);
		setPanelMessage(null);
		try {
			await updateServiceAPIKeyFn({
				data: {
					apiKeyId: apiKey.id,
					name: draft.name.trim(),
					enabled: draft.enabled,
				},
			});
			setPanelMessage({
				tone: "success",
				text: `${draft.name.trim()} updated.`,
			});
			await refresh();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error
						? error.message
						: "Failed to update service API key.",
			});
		} finally {
			setSavingServiceKeyId(null);
		}
	};

	return (
		<div className="space-y-4">
			{panelMessage ? <StatusNotice message={panelMessage} /> : null}
			{revealedKey ? (
				<GeneratedKeyCard
					revealedKey={revealedKey}
					label={revealedKeyLabel}
					copiedKeyId={copiedKeyId}
					onCopy={copySecret}
				/>
			) : null}

			<div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
				<Card className="border-slate-200/60 bg-white/88 shadow-sm">
					<CardHeader className="gap-2">
						<div className="flex items-center gap-2">
							<FolderPlus className="size-4 text-slate-700" />
							<CardTitle className="text-base">Projects</CardTitle>
						</div>
						<CardDescription>
							Group workflow-bound ingestion keys and broader service keys under
							the same project.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<form
							className="flex flex-col gap-2 sm:flex-row"
							onSubmit={(event) => void handleCreateProject(event)}
						>
							<Input
								value={newProjectName}
								onChange={(event) => setNewProjectName(event.target.value)}
								placeholder="Warehouse intake"
								className="border-slate-300 bg-white"
							/>
							<Button type="submit" disabled={creatingProject}>
								{creatingProject ? "Creating..." : "Create project"}
							</Button>
						</form>

						<div className="grid gap-2">
							{dashboard.projects.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
									Create the first project to start issuing API keys.
								</div>
							) : (
								dashboard.projects.map((project) => (
									<button
										key={project.id}
										type="button"
										onClick={() => setSelectedProjectId(project.id)}
										className={cn(
											"rounded-2xl border px-4 py-3 text-left transition-colors",
											project.id === selectedProjectId
												? "border-slate-900 bg-slate-900 text-white shadow-sm"
												: "border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300",
										)}
									>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<p className="font-medium">{project.name}</p>
											{project.archivedAt ? (
												<Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
													Archived
												</Badge>
											) : null}
										</div>
										<p
											className={cn(
												"mt-1 text-xs",
												project.id === selectedProjectId
													? "text-white/75"
													: "text-slate-500",
											)}
										>
											{project.workflowApiKeyCount} workflow keys,{" "}
											{project.serviceApiKeyCount} service keys
										</p>
									</button>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card className="border-slate-200/60 bg-white/90 shadow-sm">
					<CardHeader className="gap-3">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle className="text-base">
									{selectedProject?.name ?? "Choose a project"}
								</CardTitle>
								<CardDescription>
									{selectedProject
										? "Workflow keys bind uploads to a default workflow. Service keys keep broader orchestration access."
										: "Pick a project on the left to manage its API keys."}
								</CardDescription>
							</div>
							{selectedProject ? (
								<Button
									type="button"
									variant="outline"
									onClick={() => void handleToggleProjectArchive()}
									disabled={settingProjectArchiveId === selectedProject.id}
									className="rounded-full"
								>
									<Archive className="mr-2 size-4" />
									{settingProjectArchiveId === selectedProject.id
										? "Saving..."
										: selectedProject.archivedAt
											? "Restore project"
											: "Archive project"}
								</Button>
							) : null}
						</div>
						{selectedProject ? (
							<div className="flex flex-wrap gap-2">
								<Badge variant="outline" className="rounded-full bg-white/80">
									{selectedProject.workflowApiKeyCount} workflow keys
								</Badge>
								<Badge variant="outline" className="rounded-full bg-white/80">
									{selectedProject.serviceApiKeyCount} service keys
								</Badge>
								<Badge variant="outline" className="rounded-full bg-white/80">
									{selectedProject.apiKeyCount} total keys
								</Badge>
								<Badge variant="outline" className="rounded-full bg-white/80">
									{showArchived
										? "Archived items visible"
										: "Archived items hidden"}
								</Badge>
							</div>
						) : null}
					</CardHeader>
					<CardContent>
						{selectedProject ? (
							<div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600">
								{selectedProject.archivedAt
									? "This project is archived. Existing API keys stay attributable, but new keys are blocked until you restore it."
									: "Use workflow keys for inbound document identity and service keys for orchestrators, backend jobs, or trusted integrations."}
							</div>
						) : (
							<div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-8 text-sm text-slate-500">
								Create a project first, then add workflow and service keys here.
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{selectedProject ? (
				<div className="grid gap-4 xl:grid-cols-2">
					<Card className="border-slate-200/60 bg-white/90 shadow-sm">
						<CardHeader className="gap-2">
							<div className="flex items-center gap-2">
								<Workflow className="size-4 text-sky-700" />
								<CardTitle className="text-base">Workflow Keys</CardTitle>
							</div>
							<CardDescription>
								Each workflow key binds uploads to one default workflow via its
								own API key identity.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<form
								className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
								onSubmit={(event) => void handleCreateWorkflowKey(event)}
							>
								<Input
									value={newWorkflowKeyName}
									onChange={(event) =>
										setNewWorkflowKeyName(event.target.value)
									}
									placeholder="Dock intake key"
									className="border-slate-300 bg-white"
									disabled={isSelectedProjectArchived}
								/>
								<Select
									value={newWorkflowKeyWorkflowId}
									onValueChange={setNewWorkflowKeyWorkflowId}
									disabled={
										isSelectedProjectArchived ||
										dashboard.workflows.length === 0
									}
								>
									<SelectTrigger className="border-slate-300 bg-white">
										<SelectValue placeholder="Choose a workflow" />
									</SelectTrigger>
									<SelectContent>
										{dashboard.workflows.map((workflow) => (
											<SelectItem key={workflow.id} value={workflow.id}>
												{workflow.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									type="submit"
									disabled={
										isSelectedProjectArchived ||
										creatingWorkflowKey ||
										dashboard.workflows.length === 0
									}
									className="w-full"
								>
									{creatingWorkflowKey ? "Creating..." : "Create workflow key"}
								</Button>
								<p className="text-xs text-slate-500">
									Workflow keys can authenticate upload and document endpoints
									and auto-run their bound workflow on upload acknowledge.
								</p>
							</form>

							{workflowKeysForProject.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
									No workflow keys in this project yet.
								</div>
							) : (
								<div className="space-y-3">
									{workflowKeysForProject.map((apiKey) => {
										const draft = workflowKeyDrafts[apiKey.id] ?? {
											name: apiKey.name ?? "",
											enabled: apiKey.enabled,
											agentGraphId: apiKey.agentGraphId,
										};

										return (
											<div
												key={apiKey.id}
												className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
											>
												<div className="flex flex-wrap items-start justify-between gap-3">
													<div className="space-y-2">
														<div className="flex flex-wrap items-center gap-2">
															<p className="font-medium text-slate-900">
																{apiKey.name ?? "Untitled workflow key"}
															</p>
															<Badge
																className={cn(
																	"rounded-full",
																	apiKey.enabled
																		? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
																		: "bg-slate-200 text-slate-700 hover:bg-slate-200",
																)}
															>
																{apiKey.enabled ? "Enabled" : "Disabled"}
															</Badge>
															<Badge
																variant="outline"
																className="rounded-full bg-white/80"
															>
																{formatKeyLabel(
																	apiKey.start,
																	apiKey.prefix,
																	apiKey.id,
																)}
															</Badge>
														</div>
														<p className="text-sm text-slate-500">
															Bound workflow:{" "}
															<span className="font-medium text-slate-700">
																{apiKey.workflowName ??
																	workflowNameById.get(apiKey.agentGraphId) ??
																	"Unknown workflow"}
															</span>
														</p>
													</div>
													<Button
														type="button"
														size="sm"
														onClick={() => void handleSaveWorkflowKey(apiKey)}
														disabled={savingWorkflowKeyId === apiKey.id}
													>
														{savingWorkflowKeyId === apiKey.id
															? "Saving..."
															: "Save"}
													</Button>
												</div>

												<div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto]">
													<Input
														value={draft.name}
														onChange={(event) =>
															setWorkflowKeyDrafts((current) => ({
																...current,
																[apiKey.id]: {
																	...draft,
																	name: event.target.value,
																},
															}))
														}
														className="border-slate-300 bg-white"
													/>
													<Select
														value={draft.agentGraphId}
														onValueChange={(value) =>
															setWorkflowKeyDrafts((current) => ({
																...current,
																[apiKey.id]: {
																	...draft,
																	agentGraphId: value,
																},
															}))
														}
													>
														<SelectTrigger className="border-slate-300 bg-white">
															<SelectValue placeholder="Choose a workflow" />
														</SelectTrigger>
														<SelectContent>
															{dashboard.workflows.map((workflow) => (
																<SelectItem
																	key={workflow.id}
																	value={workflow.id}
																>
																	{workflow.name}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<Toggle
														pressed={draft.enabled}
														onPressedChange={(enabled) =>
															setWorkflowKeyDrafts((current) => ({
																...current,
																[apiKey.id]: {
																	...draft,
																	enabled,
																},
															}))
														}
														variant="outline"
														className="justify-center"
													>
														{draft.enabled ? "Enabled" : "Disabled"}
													</Toggle>
												</div>

												<div className="mt-4 space-y-2">
													<KeyMetaRow {...apiKey} />
													<p className="text-xs text-slate-500">
														Created {formatDateTime(apiKey.createdAt)}. Updated{" "}
														{formatDateTime(apiKey.updatedAt)}.
													</p>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</CardContent>
					</Card>

					<Card className="border-slate-200/60 bg-white/90 shadow-sm">
						<CardHeader className="gap-2">
							<div className="flex items-center gap-2">
								<Shield className="size-4 text-violet-700" />
								<CardTitle className="text-base">Service Keys</CardTitle>
							</div>
							<CardDescription>
								Service keys stay project-scoped and can call broader APIs
								without carrying an implied default workflow.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<form
								className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
								onSubmit={(event) => void handleCreateServiceKey(event)}
							>
								<Input
									value={newServiceKeyName}
									onChange={(event) => setNewServiceKeyName(event.target.value)}
									placeholder="Warehouse backend"
									className="border-slate-300 bg-white"
									disabled={isSelectedProjectArchived}
								/>
								<Button
									type="submit"
									disabled={isSelectedProjectArchived || creatingServiceKey}
									className="w-full"
								>
									{creatingServiceKey ? "Creating..." : "Create service key"}
								</Button>
								<p className="text-xs text-slate-500">
									Use service keys for trusted jobs, integrations, and scoped
									workflow execution across documents in the project.
								</p>
							</form>

							{serviceKeysForProject.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
									No service keys in this project yet.
								</div>
							) : (
								<div className="space-y-3">
									{serviceKeysForProject.map((apiKey) => {
										const draft = serviceKeyDrafts[apiKey.id] ?? {
											name: apiKey.name ?? "",
											enabled: apiKey.enabled,
										};

										return (
											<div
												key={apiKey.id}
												className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
											>
												<div className="flex flex-wrap items-start justify-between gap-3">
													<div className="space-y-2">
														<div className="flex flex-wrap items-center gap-2">
															<p className="font-medium text-slate-900">
																{apiKey.name ?? "Untitled service key"}
															</p>
															<Badge
																className={cn(
																	"rounded-full",
																	apiKey.enabled
																		? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
																		: "bg-slate-200 text-slate-700 hover:bg-slate-200",
																)}
															>
																{apiKey.enabled ? "Enabled" : "Disabled"}
															</Badge>
															<Badge
																variant="outline"
																className="rounded-full bg-white/80"
															>
																{formatKeyLabel(
																	apiKey.start,
																	apiKey.prefix,
																	apiKey.id,
																)}
															</Badge>
														</div>
														<p className="text-sm text-slate-500">
															Project-scoped orchestration key
														</p>
													</div>
													<Button
														type="button"
														size="sm"
														onClick={() => void handleSaveServiceKey(apiKey)}
														disabled={savingServiceKeyId === apiKey.id}
													>
														{savingServiceKeyId === apiKey.id
															? "Saving..."
															: "Save"}
													</Button>
												</div>

												<div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
													<Input
														value={draft.name}
														onChange={(event) =>
															setServiceKeyDrafts((current) => ({
																...current,
																[apiKey.id]: {
																	...draft,
																	name: event.target.value,
																},
															}))
														}
														className="border-slate-300 bg-white"
													/>
													<Toggle
														pressed={draft.enabled}
														onPressedChange={(enabled) =>
															setServiceKeyDrafts((current) => ({
																...current,
																[apiKey.id]: {
																	...draft,
																	enabled,
																},
															}))
														}
														variant="outline"
														className="justify-center"
													>
														{draft.enabled ? "Enabled" : "Disabled"}
													</Toggle>
												</div>

												<div className="mt-4 space-y-2">
													<KeyMetaRow {...apiKey} />
													<p className="text-xs text-slate-500">
														Created {formatDateTime(apiKey.createdAt)}. Updated{" "}
														{formatDateTime(apiKey.updatedAt)}.
													</p>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			) : null}
		</div>
	);
}
