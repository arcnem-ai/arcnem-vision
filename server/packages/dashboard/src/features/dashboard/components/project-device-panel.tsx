import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Copy,
	FolderOpen,
	FolderPlus,
	KeyRound,
	MonitorSmartphone,
	Plus,
	Save,
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
	createDevice,
	createDeviceAPIKey,
	createProject,
	deleteDeviceAPIKey,
	updateDevice,
	updateDeviceAPIKey,
} from "@/features/dashboard/server-fns";
import type {
	DashboardData,
	GeneratedDeviceAPIKey,
	StatusMessage,
} from "@/features/dashboard/types";
import { cn } from "@/lib/utils";

type DeviceDraft = {
	name: string;
	agentGraphId: string;
};

type APIKeyDraft = {
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
	if (!enabled) {
		return "Unlimited";
	}

	const minutes = Math.round(windowMs / 60_000);
	if (minutes >= 1_440 && minutes % 1_440 === 0) {
		const days = minutes / 1_440;
		return `${max.toLocaleString()} / ${days}d`;
	}
	if (minutes >= 60 && minutes % 60 === 0) {
		const hours = minutes / 60;
		return `${max.toLocaleString()} / ${hours}h`;
	}
	return `${max.toLocaleString()} / ${minutes}m`;
}

function formatKeyLabel(
	start: string | null,
	prefix: string | null,
	id: string,
) {
	return start ?? prefix ?? id.slice(0, 8);
}

export function ProjectDevicePanel({
	dashboard,
}: {
	dashboard: DashboardData;
}) {
	const router = useRouter();
	const createProjectFn = useServerFn(createProject);
	const createDeviceFn = useServerFn(createDevice);
	const updateDeviceFn = useServerFn(updateDevice);
	const createDeviceAPIKeyFn = useServerFn(createDeviceAPIKey);
	const updateDeviceAPIKeyFn = useServerFn(updateDeviceAPIKey);
	const deleteDeviceAPIKeyFn = useServerFn(deleteDeviceAPIKey);

	const [selectedProjectId, setSelectedProjectId] = useState(
		dashboard.projects[0]?.id ?? "",
	);
	const [newProjectName, setNewProjectName] = useState("");
	const [newDeviceName, setNewDeviceName] = useState("");
	const [newDeviceWorkflowId, setNewDeviceWorkflowId] = useState(
		dashboard.workflows[0]?.id ?? "",
	);
	const [deviceDrafts, setDeviceDrafts] = useState<Record<string, DeviceDraft>>(
		{},
	);
	const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, APIKeyDraft>>(
		{},
	);
	const [newKeyNamesByDevice, setNewKeyNamesByDevice] = useState<
		Record<string, string>
	>({});
	const [panelMessage, setPanelMessage] = useState<StatusMessage | null>(null);
	const [revealedKey, setRevealedKey] = useState<GeneratedDeviceAPIKey | null>(
		null,
	);
	const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

	const [creatingProject, setCreatingProject] = useState(false);
	const [creatingDevice, setCreatingDevice] = useState(false);
	const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);
	const [creatingKeyForDeviceId, setCreatingKeyForDeviceId] = useState<
		string | null
	>(null);
	const [savingApiKeyId, setSavingApiKeyId] = useState<string | null>(null);
	const [deletingApiKeyId, setDeletingApiKeyId] = useState<string | null>(null);

	useEffect(() => {
		setSelectedProjectId((current) =>
			dashboard.projects.some((project) => project.id === current)
				? current
				: (dashboard.projects[0]?.id ?? ""),
		);
		setNewDeviceWorkflowId((current) =>
			dashboard.workflows.some((workflow) => workflow.id === current)
				? current
				: (dashboard.workflows[0]?.id ?? ""),
		);
		setDeviceDrafts(
			Object.fromEntries(
				dashboard.devices.map((device) => [
					device.id,
					{
						name: device.name,
						agentGraphId: device.agentGraphId,
					},
				]),
			),
		);
		setApiKeyDrafts(
			Object.fromEntries(
				dashboard.devices.flatMap((device) =>
					device.apiKeys.map((apiKey) => [
						apiKey.id,
						{
							name: apiKey.name ?? "",
							enabled: apiKey.enabled,
						},
					]),
				),
			),
		);
		setNewKeyNamesByDevice((current) => {
			const next: Record<string, string> = {};
			for (const device of dashboard.devices) {
				next[device.id] = current[device.id] ?? `${device.name} upload key`;
			}
			return next;
		});
	}, [dashboard]);

	useEffect(() => {
		if (!revealedKey) {
			return;
		}

		const keyStillExists = dashboard.devices.some((device) =>
			device.apiKeys.some((apiKey) => apiKey.id === revealedKey.id),
		);
		if (!keyStillExists) {
			setRevealedKey(null);
			setCopiedKeyId(null);
		}
	}, [dashboard.devices, revealedKey]);

	const selectedProject = useMemo(
		() =>
			dashboard.projects.find((project) => project.id === selectedProjectId) ??
			null,
		[dashboard.projects, selectedProjectId],
	);

	const devicesForProject = useMemo(
		() =>
			dashboard.devices.filter(
				(device) => device.projectId === selectedProjectId,
			),
		[dashboard.devices, selectedProjectId],
	);

	const deviceNameByKeyId = useMemo(
		() =>
			new Map(
				dashboard.devices.flatMap((device) =>
					device.apiKeys.map((apiKey) => [apiKey.id, device.name] as const),
				),
			),
		[dashboard.devices],
	);

	const revealedKeyDeviceName = revealedKey
		? (deviceNameByKeyId.get(revealedKey.id) ?? "Selected device")
		: null;

	const canCreateDevice =
		Boolean(selectedProject) && dashboard.workflows.length > 0;
	const canSubmitProject = Boolean(
		dashboard.organization && newProjectName.trim(),
	);
	const canSubmitDevice =
		Boolean(canCreateDevice) && newDeviceName.trim().length > 0;

	const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setCreatingProject(true);
		setPanelMessage(null);

		try {
			const project = await createProjectFn({
				data: {
					name: newProjectName,
				},
			});
			setNewProjectName("");
			setSelectedProjectId(project.id);
			setPanelMessage({
				tone: "success",
				text: `Project ${project.name} created.`,
			});
			await router.invalidate();
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

	const handleCreateDevice = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedProjectId) {
			setPanelMessage({
				tone: "error",
				text: "Create or select a project before adding a device.",
			});
			return;
		}
		if (!newDeviceWorkflowId) {
			setPanelMessage({
				tone: "error",
				text: "Create a workflow before adding a device.",
			});
			return;
		}

		setCreatingDevice(true);
		setPanelMessage(null);

		try {
			const device = await createDeviceFn({
				data: {
					projectId: selectedProjectId,
					name: newDeviceName,
					agentGraphId: newDeviceWorkflowId,
				},
			});
			setNewDeviceName("");
			setNewKeyNamesByDevice((current) => ({
				...current,
				[device.id]: `${device.name} upload key`,
			}));
			setPanelMessage({
				tone: "success",
				text: `Device ${device.name} added to ${selectedProject?.name ?? "the project"}.`,
			});
			await router.invalidate();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to create device.",
			});
		} finally {
			setCreatingDevice(false);
		}
	};

	const handleSaveDevice = async (deviceId: string) => {
		const draft = deviceDrafts[deviceId];
		if (!draft) return;

		setSavingDeviceId(deviceId);
		setPanelMessage(null);
		try {
			await updateDeviceFn({
				data: {
					deviceId,
					name: draft.name,
					agentGraphId: draft.agentGraphId,
				},
			});
			setPanelMessage({
				tone: "success",
				text: "Device updated.",
			});
			await router.invalidate();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to update device.",
			});
		} finally {
			setSavingDeviceId(null);
		}
	};

	const handleCreateAPIKey = async (deviceId: string) => {
		setCreatingKeyForDeviceId(deviceId);
		setPanelMessage(null);
		try {
			const createdKey = await createDeviceAPIKeyFn({
				data: {
					deviceId,
					name: newKeyNamesByDevice[deviceId] ?? "",
				},
			});
			setRevealedKey(createdKey);
			setCopiedKeyId(null);
			setNewKeyNamesByDevice((current) => ({
				...current,
				[deviceId]: "",
			}));
			setPanelMessage({
				tone: "success",
				text: "API key created. Copy the secret now; it will not be shown again.",
			});
			await router.invalidate();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to create API key.",
			});
		} finally {
			setCreatingKeyForDeviceId(null);
		}
	};

	const handleSaveAPIKey = async (apiKeyId: string) => {
		const draft = apiKeyDrafts[apiKeyId];
		if (!draft) return;

		setSavingApiKeyId(apiKeyId);
		setPanelMessage(null);
		try {
			await updateDeviceAPIKeyFn({
				data: {
					apiKeyId,
					name: draft.name,
					enabled: draft.enabled,
				},
			});
			setPanelMessage({
				tone: "success",
				text: "API key updated.",
			});
			await router.invalidate();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to update API key.",
			});
		} finally {
			setSavingApiKeyId(null);
		}
	};

	const handleDeleteAPIKey = async (apiKeyId: string) => {
		if (!window.confirm("Delete this API key? This cannot be undone.")) {
			return;
		}

		setDeletingApiKeyId(apiKeyId);
		setPanelMessage(null);
		try {
			await deleteDeviceAPIKeyFn({
				data: {
					apiKeyId,
				},
			});
			if (revealedKey?.id === apiKeyId) {
				setRevealedKey(null);
				setCopiedKeyId(null);
			}
			setPanelMessage({
				tone: "success",
				text: "API key deleted.",
			});
			await router.invalidate();
		} catch (error) {
			setPanelMessage({
				tone: "error",
				text:
					error instanceof Error ? error.message : "Failed to delete API key.",
			});
		} finally {
			setDeletingApiKeyId(null);
		}
	};

	const handleCopyRevealedKey = async () => {
		if (!revealedKey) {
			return;
		}
		if (!navigator.clipboard?.writeText) {
			setPanelMessage({
				tone: "error",
				text: "Clipboard access is unavailable in this browser.",
			});
			return;
		}

		try {
			await navigator.clipboard.writeText(revealedKey.value);
			setCopiedKeyId(revealedKey.id);
			setPanelMessage({
				tone: "success",
				text: "API key copied to clipboard.",
			});
		} catch {
			setPanelMessage({
				tone: "error",
				text: "Clipboard access is unavailable in this browser.",
			});
		}
	};

	return (
		<div className="grid gap-4 xl:grid-cols-[340px_1fr]">
			<Card className="border-slate-900/10 bg-white/85 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
				<CardHeader className="space-y-4 px-4 sm:px-6">
					<div className="flex items-center gap-2">
						<div className="rounded-xl bg-slate-900 p-2 text-white">
							<FolderOpen className="size-4" />
						</div>
						<div>
							<CardTitle className="font-display text-xl">Projects</CardTitle>
							<CardDescription>
								Create a project, then attach devices and keys inside it.
							</CardDescription>
						</div>
					</div>

					<form
						onSubmit={(event) => void handleCreateProject(event)}
						className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,249,239,0.95),rgba(243,248,255,0.95))] p-4"
					>
						<div className="flex items-center gap-2 text-sm font-medium text-slate-700">
							<FolderPlus className="size-4 text-amber-600" />
							New project
						</div>
						<div className="mt-3 space-y-3">
							<Input
								value={newProjectName}
								onChange={(event) => setNewProjectName(event.target.value)}
								placeholder="North Yard cameras"
								disabled={!dashboard.organization || creatingProject}
							/>
							<div className="flex items-center justify-between gap-3">
								<p className="text-xs text-slate-500">
									Slug is generated automatically for the organization.
								</p>
								<Button
									type="submit"
									size="sm"
									disabled={!canSubmitProject || creatingProject}
									className="rounded-full px-4"
								>
									{creatingProject ? "Creating..." : "Create"}
								</Button>
							</div>
						</div>
					</form>
				</CardHeader>

				<CardContent className="space-y-2 px-4 pb-4 sm:px-6">
					{dashboard.projects.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-center">
							<FolderOpen className="mx-auto size-8 text-slate-300" />
							<p className="mt-3 text-sm font-medium text-slate-600">
								No projects yet
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Create the first project to start registering devices.
							</p>
						</div>
					) : (
						dashboard.projects.map((project) => {
							const isSelected = project.id === selectedProjectId;
							return (
								<button
									type="button"
									key={project.id}
									onClick={() => setSelectedProjectId(project.id)}
									className={cn(
										"group w-full rounded-2xl border px-3 py-3 text-left transition-all",
										isSelected
											? "border-slate-900/15 bg-slate-900 text-white shadow-md"
											: "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
									)}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate font-semibold">{project.name}</p>
											<p
												className={cn(
													"mt-1 truncate text-xs",
													isSelected ? "text-slate-300" : "text-slate-500",
												)}
											>
												{project.slug}
											</p>
										</div>
										<Badge
											variant="outline"
											className={cn(
												"shrink-0 rounded-full",
												isSelected
													? "border-white/20 bg-white/10 text-white"
													: "border-slate-200 bg-slate-50 text-slate-600",
											)}
										>
											{project.deviceCount} devices
										</Badge>
									</div>
									<p
										className={cn(
											"mt-3 text-xs",
											isSelected ? "text-slate-300" : "text-slate-500",
										)}
									>
										{project.apiKeyCount} keys issued for this project
									</p>
								</button>
							);
						})
					)}
				</CardContent>
			</Card>

			<div className="space-y-4">
				{panelMessage ? (
					<div
						className={cn(
							"rounded-2xl px-4 py-3 text-sm shadow-sm",
							panelMessage.tone === "success"
								? "border border-emerald-200 bg-emerald-50 text-emerald-800"
								: "border border-rose-200 bg-rose-50 text-rose-800",
						)}
					>
						{panelMessage.text}
					</div>
				) : null}

				{revealedKey ? (
					<Card className="overflow-hidden border-amber-300/80 bg-[linear-gradient(135deg,rgba(255,248,220,0.98),rgba(255,252,244,0.98))] shadow-[0_22px_60px_rgba(234,179,8,0.12)]">
						<CardHeader className="px-4 pb-3 sm:px-6">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<CardTitle className="font-display text-xl text-amber-950">
										New API key ready
									</CardTitle>
									<CardDescription className="mt-1 text-amber-900/80">
										Use this secret for {revealedKeyDeviceName}. It is only
										shown once.
									</CardDescription>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => void handleCopyRevealedKey()}
									className="border-amber-300 bg-white/80 text-amber-950 hover:bg-white"
								>
									<Copy className="size-4" />
									{copiedKeyId === revealedKey.id ? "Copied" : "Copy key"}
								</Button>
							</div>
						</CardHeader>
						<CardContent className="px-4 pb-5 sm:px-6">
							<div className="rounded-2xl bg-slate-950 px-4 py-4 font-mono text-sm text-amber-100 shadow-inner break-all">
								{revealedKey.value}
							</div>
							<p className="mt-3 text-xs text-amber-950/80">
								Store this secret in the device now. After refresh, only the
								identifier {revealedKey.start ?? revealedKey.prefix ?? "prefix"}
								will remain visible.
							</p>
						</CardContent>
					</Card>
				) : null}

				<Card className="border-slate-900/10 bg-white/85 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
					<CardHeader className="gap-4 px-4 sm:px-6">
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div>
								<div className="flex items-center gap-2">
									<div className="rounded-xl bg-emerald-600 p-2 text-white">
										<MonitorSmartphone className="size-4" />
									</div>
									<CardTitle className="font-display text-xl">
										{selectedProject
											? `${selectedProject.name} control room`
											: "Project devices"}
									</CardTitle>
								</div>
								<CardDescription className="mt-2 max-w-2xl">
									Wire each device to a workflow, then issue the API keys it
									needs for uploads.
								</CardDescription>
							</div>
							{selectedProject ? (
								<div className="grid min-w-[220px] grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
									<div>
										<p className="text-xs uppercase tracking-[0.2em] text-slate-400">
											Slug
										</p>
										<p className="mt-1 font-medium text-slate-700">
											{selectedProject.slug}
										</p>
									</div>
									<div>
										<p className="text-xs uppercase tracking-[0.2em] text-slate-400">
											Keys
										</p>
										<p className="mt-1 font-medium text-slate-700">
											{selectedProject.apiKeyCount}
										</p>
									</div>
								</div>
							) : null}
						</div>

						<form
							onSubmit={(event) => void handleCreateDevice(event)}
							className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.92),rgba(239,246,255,0.92))] p-4"
						>
							<div className="flex items-center gap-2 text-sm font-medium text-slate-700">
								<Plus className="size-4 text-emerald-600" />
								New device inside this project
							</div>
							<div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(200px,0.8fr)_auto]">
								<Input
									value={newDeviceName}
									onChange={(event) => setNewDeviceName(event.target.value)}
									placeholder="Dock camera 03"
									disabled={!canCreateDevice || creatingDevice}
								/>
								<Select
									value={newDeviceWorkflowId}
									onValueChange={setNewDeviceWorkflowId}
									disabled={!canCreateDevice || creatingDevice}
								>
									<SelectTrigger className="h-9 w-full bg-white">
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
									disabled={!canSubmitDevice || creatingDevice}
									className="rounded-full px-5"
								>
									{creatingDevice ? "Creating..." : "Add device"}
								</Button>
							</div>
							<p className="mt-3 text-xs text-slate-500">
								{dashboard.workflows.length === 0
									? "Create a workflow first, then devices can be registered here."
									: "Each new device gets a stable slug automatically and can be re-pointed later."}
							</p>
						</form>
					</CardHeader>

					<CardContent className="space-y-4 px-4 pb-5 sm:px-6">
						{!selectedProject ? (
							<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center">
								<FolderOpen className="mx-auto size-8 text-slate-300" />
								<p className="mt-3 text-sm font-medium text-slate-600">
									Choose a project to manage devices
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									The selected project is where device workflows and API keys
									are organized.
								</p>
							</div>
						) : devicesForProject.length === 0 ? (
							<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-12 text-center">
								<MonitorSmartphone className="mx-auto size-8 text-slate-300" />
								<p className="mt-3 text-sm font-medium text-slate-600">
									No devices in {selectedProject.name} yet
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Add the first device above, then issue API keys for it here.
								</p>
							</div>
						) : (
							devicesForProject.map((device) => {
								const draft = deviceDrafts[device.id] ?? {
									name: device.name,
									agentGraphId: device.agentGraphId,
								};
								const deviceIsDirty =
									draft.name !== device.name ||
									draft.agentGraphId !== device.agentGraphId;
								const isConnected = device.status === "connected";

								return (
									<div
										key={device.id}
										className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] shadow-[0_12px_35px_rgba(15,23,42,0.05)]"
									>
										<div className="border-b border-slate-200/80 px-4 py-4 sm:px-5">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="flex items-center gap-2">
														<div
															className={cn(
																"rounded-xl p-2",
																isConnected ? "bg-emerald-50" : "bg-slate-100",
															)}
														>
															<MonitorSmartphone
																className={cn(
																	"size-4",
																	isConnected
																		? "text-emerald-600"
																		: "text-slate-400",
																)}
															/>
														</div>
														<div>
															<p className="font-display text-lg text-slate-900">
																{device.name}
															</p>
															<p className="text-xs text-slate-500">
																Slug: {device.slug}
															</p>
														</div>
													</div>
												</div>
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														variant="outline"
														className={cn(
															"rounded-full px-2.5",
															isConnected
																? "border-emerald-200 bg-emerald-50 text-emerald-700"
																: "border-slate-200 bg-slate-50 text-slate-500",
														)}
													>
														{device.status}
													</Badge>
													<Badge
														variant="outline"
														className="rounded-full border-slate-200 bg-white text-slate-600"
													>
														{device.apiKeyCount} keys
													</Badge>
												</div>
											</div>

											<div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)_auto]">
												<Input
													value={draft.name}
													onChange={(event) =>
														setDeviceDrafts((current) => ({
															...current,
															[device.id]: {
																...draft,
																name: event.target.value,
															},
														}))
													}
													placeholder="Device name"
												/>
												<Select
													value={draft.agentGraphId}
													onValueChange={(value) =>
														setDeviceDrafts((current) => ({
															...current,
															[device.id]: {
																...draft,
																agentGraphId: value,
															},
														}))
													}
												>
													<SelectTrigger className="h-9 bg-white">
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
													type="button"
													onClick={() => void handleSaveDevice(device.id)}
													disabled={
														!deviceIsDirty ||
														draft.name.trim().length === 0 ||
														savingDeviceId === device.id
													}
													className="rounded-full px-4"
												>
													<Save className="size-4" />
													{savingDeviceId === device.id ? "Saving..." : "Save"}
												</Button>
											</div>

											<div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
												<span className="inline-flex items-center gap-1.5">
													<Workflow className="size-3.5" />
													{device.workflowName ?? "No workflow"}
												</span>
												<span>Updated {relativeTime(device.updatedAt)}</span>
											</div>
										</div>

										<div className="space-y-3 px-4 py-4 sm:px-5">
											<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
												<div className="flex items-center gap-2 text-sm font-medium text-slate-700">
													<KeyRound className="size-4 text-amber-600" />
													Issue a new device key
												</div>
												<div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
													<Input
														value={newKeyNamesByDevice[device.id] ?? ""}
														onChange={(event) =>
															setNewKeyNamesByDevice((current) => ({
																...current,
																[device.id]: event.target.value,
															}))
														}
														placeholder={`${device.name} upload key`}
													/>
													<Button
														type="button"
														variant="outline"
														onClick={() => void handleCreateAPIKey(device.id)}
														disabled={
															creatingKeyForDeviceId === device.id ||
															(newKeyNamesByDevice[device.id] ?? "").trim()
																.length === 0
														}
														className="rounded-full border-amber-300 bg-white text-amber-950 hover:bg-amber-50"
													>
														{creatingKeyForDeviceId === device.id
															? "Creating..."
															: "Create key"}
													</Button>
												</div>
												<p className="mt-3 text-xs text-slate-500">
													The generated secret is shown once, then only the
													public identifier remains visible here.
												</p>
											</div>

											{device.apiKeys.length === 0 ? (
												<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
													<KeyRound className="mx-auto size-7 text-slate-300" />
													<p className="mt-2 text-sm font-medium text-slate-600">
														No API keys for this device
													</p>
													<p className="mt-1 text-xs text-muted-foreground">
														Create one above so the device can authenticate
														uploads.
													</p>
												</div>
											) : (
												device.apiKeys.map((apiKey) => {
													const apiKeyDraft = apiKeyDrafts[apiKey.id] ?? {
														name: apiKey.name ?? "",
														enabled: apiKey.enabled,
													};
													const apiKeyIsDirty =
														apiKeyDraft.name !== (apiKey.name ?? "") ||
														apiKeyDraft.enabled !== apiKey.enabled;

													return (
														<div
															key={apiKey.id}
															className="rounded-2xl border border-slate-200 bg-white p-4"
														>
															<div className="flex flex-wrap items-start justify-between gap-3">
																<div>
																	<div className="flex items-center gap-2">
																		<p className="font-medium text-slate-900">
																			{formatKeyLabel(
																				apiKey.start,
																				apiKey.prefix,
																				apiKey.id,
																			)}
																		</p>
																		<Badge
																			variant="outline"
																			className={cn(
																				"rounded-full",
																				apiKey.enabled
																					? "border-emerald-200 bg-emerald-50 text-emerald-700"
																					: "border-slate-200 bg-slate-50 text-slate-500",
																			)}
																		>
																			{apiKey.enabled ? "Enabled" : "Paused"}
																		</Badge>
																	</div>
																	<p className="mt-1 text-xs text-slate-500">
																		Created {formatDateTime(apiKey.createdAt)}.
																		Last request{" "}
																		{relativeTime(apiKey.lastRequest)}.
																	</p>
																</div>
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() =>
																		void handleDeleteAPIKey(apiKey.id)
																	}
																	disabled={deletingApiKeyId === apiKey.id}
																	className="text-slate-500 hover:text-rose-600"
																>
																	{deletingApiKeyId === apiKey.id
																		? "Deleting..."
																		: "Delete"}
																</Button>
															</div>

															<div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
																<Input
																	value={apiKeyDraft.name}
																	onChange={(event) =>
																		setApiKeyDrafts((current) => ({
																			...current,
																			[apiKey.id]: {
																				...apiKeyDraft,
																				name: event.target.value,
																			},
																		}))
																	}
																	placeholder="API key name"
																/>
																<Toggle
																	pressed={apiKeyDraft.enabled}
																	onPressedChange={(pressed) =>
																		setApiKeyDrafts((current) => ({
																			...current,
																			[apiKey.id]: {
																				...apiKeyDraft,
																				enabled: pressed,
																			},
																		}))
																	}
																	variant="outline"
																	size="sm"
																	className="rounded-full px-4"
																>
																	{apiKeyDraft.enabled ? "Enabled" : "Disabled"}
																</Toggle>
																<Button
																	type="button"
																	variant="outline"
																	onClick={() =>
																		void handleSaveAPIKey(apiKey.id)
																	}
																	disabled={
																		!apiKeyIsDirty ||
																		apiKeyDraft.name.trim().length === 0 ||
																		savingApiKeyId === apiKey.id
																	}
																	className="rounded-full px-4"
																>
																	{savingApiKeyId === apiKey.id
																		? "Saving..."
																		: "Save"}
																</Button>
															</div>

															<div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
																<span>
																	Rate limit{" "}
																	{formatRateLimit(
																		apiKey.rateLimitMax,
																		apiKey.rateLimitTimeWindow,
																		apiKey.rateLimitEnabled,
																	)}
																</span>
																<span>
																	Recorded requests{" "}
																	{apiKey.requestCount.toLocaleString()}
																</span>
																{apiKey.expiresAt ? (
																	<span>
																		Expires {formatDateTime(apiKey.expiresAt)}
																	</span>
																) : null}
															</div>
														</div>
													);
												})
											)}
										</div>
									</div>
								);
							})
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
