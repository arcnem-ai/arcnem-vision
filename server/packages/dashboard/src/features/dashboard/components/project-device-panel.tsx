import {
	CircleDotDashed,
	FolderOpen,
	MonitorSmartphone,
	Workflow,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { DashboardData, StatusMessage } from "@/features/dashboard/types";
import { cn } from "@/lib/utils";

function relativeTime(iso: string): string {
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

export function ProjectDevicePanel({
	dashboard,
	selectedProjectId,
	selectedByDevice,
	onSelectProject,
	onSelectDeviceWorkflow,
	onAssignToDevice,
	savingDeviceId,
	saveMessage,
}: {
	dashboard: DashboardData;
	selectedProjectId: string;
	selectedByDevice: Record<string, string>;
	onSelectProject: (projectId: string) => void;
	onSelectDeviceWorkflow: (deviceId: string, workflowId: string) => void;
	onAssignToDevice: (deviceId: string) => Promise<void>;
	savingDeviceId: string | null;
	saveMessage: StatusMessage | null;
}) {
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

	const workflowOptions = useMemo(
		() =>
			dashboard.workflows.map((workflow) => ({
				id: workflow.id,
				name: workflow.name,
			})),
		[dashboard.workflows],
	);

	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(260px,330px)_1fr]">
			<Card className="border-slate-900/10 bg-white/85">
				<CardHeader className="px-4 sm:px-6">
					<div className="flex items-center gap-2">
						<div className="rounded-lg bg-slate-900 p-1.5">
							<FolderOpen className="size-4 text-white" />
						</div>
						<CardTitle className="font-display text-xl">Projects</CardTitle>
					</div>
					<CardDescription>
						Choose a project to manage its connected devices.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 px-4 sm:px-6">
					{dashboard.projects.length === 0 ? (
						<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-8 text-center">
							<FolderOpen className="size-8 text-slate-300" />
							<p className="text-sm text-muted-foreground">
								No projects found for this organization yet.
							</p>
						</div>
					) : (
						dashboard.projects.map((project) => {
							const isSelected = project.id === selectedProjectId;
							return (
								<button
									type="button"
									key={project.id}
									onClick={() => onSelectProject(project.id)}
									className={cn(
										"group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all",
										isSelected
											? "border-slate-900/20 bg-slate-900 text-white shadow-md"
											: "border-slate-900/10 bg-white hover:border-slate-900/20 hover:shadow-sm",
									)}
								>
									<div
										className={cn(
											"flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
											isSelected
												? "bg-white/15"
												: "bg-slate-100 group-hover:bg-slate-200",
										)}
									>
										<FolderOpen
											className={cn(
												"size-4",
												isSelected ? "text-white" : "text-slate-500",
											)}
										/>
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{project.name}</p>
										<p
											className={cn(
												"truncate text-xs",
												isSelected ? "text-slate-300" : "text-muted-foreground",
											)}
										>
											{project.slug}
										</p>
									</div>
									<Badge
										variant="outline"
										className={cn(
											"shrink-0 rounded-full tabular-nums",
											isSelected ? "border-slate-500 text-slate-200" : "",
										)}
									>
										{project.deviceCount}
									</Badge>
								</button>
							);
						})
					)}
				</CardContent>
			</Card>

			<Card className="min-w-0 border-slate-900/10 bg-white/85">
				<CardHeader className="px-4 sm:px-6">
					<div className="flex items-center gap-2">
						<div className="shrink-0 rounded-lg bg-emerald-600 p-1.5">
							<MonitorSmartphone className="size-4 text-white" />
						</div>
						<CardTitle className="font-display truncate text-xl">
							{selectedProject
								? `${selectedProject.name} devices`
								: "Connected devices"}
						</CardTitle>
					</div>
					<CardDescription>
						Assign the right workflow to each device. This is the high-level
						customization layer for local testing.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 px-4 sm:px-6">
					{saveMessage ? (
						<div
							className={cn(
								"rounded-lg px-3 py-2 text-sm",
								saveMessage.tone === "success"
									? "border border-emerald-200 bg-emerald-50 text-emerald-800"
									: "border border-rose-200 bg-rose-50 text-rose-800",
							)}
						>
							{saveMessage.text}
						</div>
					) : null}

					{devicesForProject.length === 0 ? (
						<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-10 text-center">
							<MonitorSmartphone className="size-8 text-slate-300" />
							<div>
								<p className="text-sm font-medium text-slate-500">
									No devices connected
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Devices will appear here once they connect to this project.
								</p>
							</div>
						</div>
					) : (
						devicesForProject.map((device) => {
							const isConnected = device.status === "connected";
							return (
								<div
									key={device.id}
									className={cn(
										"overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md",
										isConnected ? "border-emerald-200/60" : "border-slate-200",
									)}
								>
									<div className="flex items-start gap-3 p-3 pb-2 sm:p-4 sm:pb-3">
										<div
											className={cn(
												"flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10",
												isConnected ? "bg-emerald-50" : "bg-slate-100",
											)}
										>
											<MonitorSmartphone
												className={cn(
													"size-4 sm:size-5",
													isConnected ? "text-emerald-600" : "text-slate-400",
												)}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													<p className="truncate font-semibold text-sm sm:text-base">
														{device.name}
													</p>
													<p className="truncate text-xs text-muted-foreground">
														{device.slug}
													</p>
												</div>
												<Badge
													variant="outline"
													className={cn(
														"shrink-0 rounded-full text-[11px]",
														isConnected
															? "border-emerald-200 bg-emerald-50 text-emerald-700"
															: "border-slate-200 bg-slate-50 text-slate-500",
													)}
												>
													{isConnected ? (
														<span className="relative mr-1 flex size-2">
															<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
															<span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
														</span>
													) : (
														<CircleDotDashed className="mr-1 size-3" />
													)}
													{device.status}
												</Badge>
											</div>
										</div>
									</div>

									<div className="border-t border-slate-100 bg-slate-50/50 px-3 py-2.5 sm:px-4 sm:py-3">
										<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
											<Workflow className="size-3.5 shrink-0" />
											<span className="truncate font-medium">
												{device.workflowName ?? "No workflow"}
											</span>
											<span className="shrink-0 mx-1 text-slate-300">·</span>
											<span className="shrink-0">
												{relativeTime(device.updatedAt)}
											</span>
										</div>
									</div>

									<div className="border-t border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3">
										<div className="flex flex-col gap-2 sm:flex-row">
											<Select
												value={
													selectedByDevice[device.id] ?? device.agentGraphId
												}
												onValueChange={(value) =>
													onSelectDeviceWorkflow(device.id, value)
												}
											>
												<SelectTrigger className="h-9 w-full bg-white text-sm sm:flex-1">
													<SelectValue placeholder="Attach a workflow" />
												</SelectTrigger>
												<SelectContent>
													{workflowOptions.map((workflow) => (
														<SelectItem key={workflow.id} value={workflow.id}>
															{workflow.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<Button
												type="button"
												size="sm"
												onClick={() => void onAssignToDevice(device.id)}
												disabled={savingDeviceId === device.id}
												className="shrink-0 rounded-lg px-4"
											>
												{savingDeviceId === device.id ? "Saving..." : "Apply"}
											</Button>
										</div>
									</div>
								</div>
							);
						})
					)}
				</CardContent>
			</Card>
		</div>
	);
}
