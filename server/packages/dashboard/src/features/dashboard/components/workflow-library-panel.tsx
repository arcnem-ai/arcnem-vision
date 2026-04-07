import { Play, PlusCircle, Search, Sparkles, Workflow, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DashboardData } from "@/features/dashboard/types";
import { NodeCharacter } from "./node-character";

type WorkflowTemplate = DashboardData["workflowTemplates"][number];

function summarizeTemplateSearchText(template: WorkflowTemplate) {
	return [
		template.name,
		template.description,
		template.entryNode,
		template.visibility,
		...template.nodeSamples.flatMap((node) => [
			node.nodeKey,
			node.nodeType,
			...node.toolNames,
		]),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function formatTemplateNodeMix(template: WorkflowTemplate) {
	return [
		template.nodeTypeCounts.worker > 0
			? `${template.nodeTypeCounts.worker} workers`
			: null,
		template.nodeTypeCounts.supervisor > 0
			? `${template.nodeTypeCounts.supervisor} supervisors`
			: null,
		template.nodeTypeCounts.condition > 0
			? `${template.nodeTypeCounts.condition} conditions`
			: null,
		template.nodeTypeCounts.tool > 0
			? `${template.nodeTypeCounts.tool} tools`
			: null,
	]
		.filter((value): value is string => value !== null)
		.slice(0, 3);
}

function WorkflowTemplatePicker({
	isOpen,
	workflowTemplates,
	startingTemplateId,
	onClose,
	onStartFromTemplate,
}: {
	isOpen: boolean;
	workflowTemplates: DashboardData["workflowTemplates"];
	startingTemplateId: string | null;
	onClose: () => void;
	onStartFromTemplate: (workflowTemplate: WorkflowTemplate) => Promise<void>;
}) {
	const [search, setSearch] = useState("");
	const deferredSearch = useDeferredValue(search);

	useEffect(() => {
		if (!isOpen) {
			setSearch("");
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && startingTemplateId === null) {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, onClose, startingTemplateId]);

	const filteredTemplates = useMemo(() => {
		const query = deferredSearch.trim().toLowerCase();
		if (!query) {
			return workflowTemplates;
		}

		return workflowTemplates.filter((template) =>
			summarizeTemplateSearchText(template).includes(query),
		);
	}, [deferredSearch, workflowTemplates]);

	const startTemplate = (template: WorkflowTemplate) => {
		void onStartFromTemplate(template)
			.then(() => {
				onClose();
			})
			.catch(() => {
				// The parent surfaces the error message and keeps the picker open.
			});
	};

	if (!isOpen) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-70 bg-slate-950/65 backdrop-blur-sm">
			<button
				type="button"
				className="absolute inset-0"
				aria-label="Close template picker"
				onClick={() => {
					if (startingTemplateId === null) {
						onClose();
					}
				}}
			/>
			<div className="absolute inset-x-4 top-5 bottom-5 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-4xl border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,252,244,0.98),rgba(247,251,255,0.98),rgba(241,253,247,0.96))] shadow-[0_30px_120px_rgba(2,6,23,0.45)]">
				<div className="flex items-start justify-between gap-4 border-b border-slate-900/10 bg-white/75 px-5 py-5 backdrop-blur">
					<div className="space-y-2">
						<Badge className="w-fit rounded-full border border-slate-900/10 bg-white/90 text-slate-700 hover:bg-white">
							Template Picker
						</Badge>
						<div>
							<h3 className="font-display text-2xl text-slate-900">
								Start from a proven graph
							</h3>
							<p className="max-w-2xl text-sm text-slate-600">
								Search by workflow name, node role, or tool, then launch a new
								graph without crowding the library view.
							</p>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={onClose}
						disabled={startingTemplateId !== null}
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/10 px-5 py-4">
					<div className="relative min-w-0 flex-1">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
						<Input
							type="search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search templates by name, node, or tool"
							autoFocus
							className="h-11 rounded-full border-slate-200 bg-white/90 pl-10 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2 text-xs">
						<Badge className="rounded-full border border-slate-900/10 bg-white/85 text-slate-700 hover:bg-white">
							{workflowTemplates.length} templates
						</Badge>
						<Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
							<Sparkles className="mr-1.5 size-3.5" />
							Clone into canvas
						</Badge>
					</div>
				</div>

				<ScrollArea className="flex-1">
					<div className="space-y-3 p-5">
						{filteredTemplates.length === 0 ? (
							<Card className="border-dashed border-slate-300/80 bg-white/70">
								<CardContent className="flex flex-col items-center gap-3 py-14 text-center">
									<div className="rounded-2xl bg-slate-100 p-4">
										<Search className="size-7 text-slate-300" />
									</div>
									<div>
										<p className="font-medium text-slate-700">
											No templates match that search
										</p>
										<p className="mt-1 text-sm text-slate-500">
											Try a workflow name, node key, or tool like OCR or vision.
										</p>
									</div>
								</CardContent>
							</Card>
						) : (
							filteredTemplates.map((template) => {
								const nodeMix = formatTemplateNodeMix(template);

								return (
									<Card
										key={template.id}
										className="border-slate-900/10 bg-white/85 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
									>
										<CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
											<div className="space-y-3">
												<div className="flex flex-wrap items-center gap-2">
													<h4 className="font-display text-xl text-slate-900">
														{template.name}
													</h4>
													<Badge className="rounded-full border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50">
														v{template.version}
													</Badge>
													<Badge variant="outline">{template.visibility}</Badge>
												</div>
												<p className="max-w-2xl text-sm leading-6 text-slate-600">
													{template.description ?? "No description yet."}
												</p>
												<div className="flex flex-wrap gap-2 text-xs">
													<Badge variant="outline">
														Entry: {template.entryNode}
													</Badge>
													<Badge variant="outline">
														{template.edgeCount} edges
													</Badge>
													<Badge variant="outline">
														{template.startedWorkflowCount} started
													</Badge>
													{nodeMix.map((item) => (
														<Badge key={item} variant="outline">
															{item}
														</Badge>
													))}
												</div>
												<div className="flex flex-wrap gap-2 text-xs text-slate-500">
													{template.nodeSamples.slice(0, 3).map((node) => (
														<span
															key={node.id}
															className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
														>
															{node.nodeKey}
														</span>
													))}
												</div>
											</div>
											<Button
												type="button"
												className="rounded-full border border-slate-900/20 bg-slate-900 px-5 text-white hover:bg-slate-800"
												onClick={() => startTemplate(template)}
												disabled={startingTemplateId !== null}
											>
												<Play className="mr-1.5 size-4" />
												{startingTemplateId === template.id
													? "Starting..."
													: "Use Template"}
											</Button>
										</CardContent>
									</Card>
								);
							})
						)}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}

export function WorkflowLibraryPanel({
	workflowTemplates,
	workflows,
	startingTemplateId,
	onOpenCreate,
	onOpenEdit,
	onStartFromTemplate,
}: {
	workflowTemplates: DashboardData["workflowTemplates"];
	workflows: DashboardData["workflows"];
	startingTemplateId: string | null;
	onOpenCreate: () => void;
	onOpenEdit: (workflow: DashboardData["workflows"][number]) => void;
	onStartFromTemplate: (workflowTemplate: WorkflowTemplate) => Promise<void>;
}) {
	const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

	return (
		<>
			<div className="space-y-6">
				<Card className="relative overflow-hidden border-slate-900/20 bg-[linear-gradient(120deg,rgba(250,204,21,0.18),rgba(14,165,233,0.12),rgba(34,197,94,0.14))] shadow-[0_18px_40px_rgba(14,165,233,0.15)] md:col-span-2">
					<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(2,6,23,0.3),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(2,6,23,0.25),transparent_35%)] opacity-25" />
					<CardHeader className="relative space-y-2">
						<Badge className="w-fit rounded-full border-slate-900/10 bg-white/80 text-slate-800 hover:bg-white">
							Visual Workflow Builder
						</Badge>
						<CardTitle className="font-display text-2xl text-slate-900">
							Design workflows on a full-screen canvas
						</CardTitle>
						<CardDescription className="max-w-2xl text-slate-700">
							Create and edit workflows in a drag-and-drop graph editor with
							node inspector controls and edge management.
						</CardDescription>
					</CardHeader>
					<CardContent className="relative space-y-4">
						<div className="flex flex-wrap gap-3">
							<Button
								type="button"
								onClick={onOpenCreate}
								className="rounded-full border border-slate-900/20 bg-slate-900 px-6 text-white hover:bg-slate-800"
							>
								<PlusCircle className="mr-1.5 size-4" />
								New Workflow Canvas
							</Button>
							{workflowTemplates.length > 0 ? (
								<Button
									type="button"
									variant="outline"
									onClick={() => setIsTemplatePickerOpen(true)}
									className="rounded-full border-slate-900/15 bg-white/75 px-6 text-slate-800 shadow-[0_10px_30px_rgba(15,23,42,0.08)] hover:bg-white"
								>
									<Search className="mr-1.5 size-4" />
									Browse Templates
								</Button>
							) : null}
						</div>
						{workflowTemplates.length > 0 ? (
							<div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
								<Badge className="rounded-full border border-slate-900/10 bg-white/80 text-slate-700 hover:bg-white">
									{workflowTemplates.length} reusable templates
								</Badge>
								<span className="rounded-full border border-white/60 bg-white/55 px-3 py-1 text-slate-600 backdrop-blur">
									Search by name, node, or tool, then launch straight into the
									canvas.
								</span>
							</div>
						) : null}
					</CardContent>
				</Card>

				<div className="space-y-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
								Workflow Library
							</p>
							<h3 className="font-display text-2xl text-slate-900">
								Your active graphs
							</h3>
						</div>
					</div>

					{workflows.length === 0 ? (
						<Card>
							<CardContent className="flex flex-col items-center gap-3 py-12 text-center">
								<div className="rounded-2xl bg-slate-100 p-4">
									<Workflow className="size-8 text-slate-300" />
								</div>
								<div>
									<p className="font-medium text-slate-500">No workflows yet</p>
									<p className="mt-1 text-sm text-muted-foreground">
										Open the canvas or browse templates to start your first
										flow.
									</p>
								</div>
							</CardContent>
						</Card>
					) : (
						<div className="grid gap-4 md:grid-cols-2">
							{workflows.map((workflow) => (
								<Card
									key={workflow.id}
									className="border-slate-900/10 bg-white/90 shadow-[0_12px_36px_rgba(2,132,199,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_44px_rgba(2,132,199,0.16)]"
								>
									<CardHeader className="space-y-2">
										<div className="flex items-start justify-between gap-3">
											<div>
												<CardTitle className="font-display text-xl">
													{workflow.name}
												</CardTitle>
												<CardDescription>
													{workflow.description ?? "No description yet."}
												</CardDescription>
											</div>
											<div className="flex items-center gap-2">
												<Badge className="rounded-full border-transparent bg-slate-900 text-slate-100 hover:bg-slate-900">
													{workflow.attachedDeviceCount} devices
												</Badge>
												<Button
													type="button"
													variant="outline"
													className="h-8 rounded-full px-3 text-xs"
													onClick={() => onOpenEdit(workflow)}
												>
													Open Canvas
												</Button>
											</div>
										</div>
										<div className="flex flex-wrap gap-2 text-xs">
											<Badge variant="outline">
												Entry: {workflow.entryNode}
											</Badge>
											<Badge variant="outline">
												{workflow.edgeCount} edges
											</Badge>
											{workflow.template ? (
												<Badge variant="outline">
													Template: {workflow.template.name}
													{workflow.template.version
														? ` v${workflow.template.version}`
														: ""}
												</Badge>
											) : null}
											<Badge variant="outline">
												{workflow.nodeTypeCounts.worker} workers
											</Badge>
											<Badge variant="outline">
												{workflow.nodeTypeCounts.supervisor} supervisors
											</Badge>
											<Badge variant="outline">
												{workflow.nodeTypeCounts.condition} conditions
											</Badge>
											<Badge variant="outline">
												{workflow.nodeTypeCounts.tool} tools
											</Badge>
										</div>
									</CardHeader>
									<CardContent>
										<div className="grid gap-2">
											{workflow.nodeSamples.length === 0 ? (
												<p className="text-sm text-muted-foreground">
													No nodes in this workflow yet.
												</p>
											) : (
												workflow.nodeSamples.map((node) => (
													<NodeCharacter
														key={node.id}
														nodeType={node.nodeType}
														nodeKey={node.nodeKey}
														toolNames={node.toolNames}
													/>
												))
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</div>
			</div>

			<WorkflowTemplatePicker
				isOpen={isTemplatePickerOpen}
				workflowTemplates={workflowTemplates}
				startingTemplateId={startingTemplateId}
				onClose={() => setIsTemplatePickerOpen(false)}
				onStartFromTemplate={onStartFromTemplate}
			/>
		</>
	);
}
