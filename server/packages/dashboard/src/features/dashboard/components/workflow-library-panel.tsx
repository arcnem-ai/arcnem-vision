import {
	Layers3,
	Play,
	PlusCircle,
	Search,
	Sparkles,
	Workflow,
	X,
} from "lucide-react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type {
	DashboardData,
	WorkflowTemplateDraft,
	WorkflowTemplateVisibility,
} from "@/features/dashboard/types";
import { NodeCharacter } from "./node-character";

type WorkflowTemplate = DashboardData["workflowTemplates"][number];
type WorkflowSummary = DashboardData["workflows"][number];

function formatTemplateVisibilityLabel(visibility: WorkflowTemplateVisibility) {
	return visibility === "public" ? "Shared" : "Internal";
}

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

function formatVersionStackLabel(versionCount: number) {
	return `${versionCount} version${versionCount === 1 ? "" : "s"}`;
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
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const deferredSearch = useDeferredValue(search);

	useEffect(() => {
		if (!isOpen) {
			setSearch("");
			setErrorMessage(null);
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
		setErrorMessage(null);
		void onStartFromTemplate(template)
			.then(() => {
				onClose();
			})
			.catch((error) => {
				setErrorMessage(
					error instanceof Error
						? error.message
						: "Failed to start a workflow from this template.",
				);
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
			<div className="absolute inset-x-4 top-5 bottom-5 mx-auto flex max-w-4xl min-h-0 flex-col overflow-hidden rounded-4xl border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,252,244,0.98),rgba(247,251,255,0.98),rgba(241,253,247,0.96))] shadow-[0_30px_120px_rgba(2,6,23,0.45)]">
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
								graph without crowding the main library. Template editing and
								version publishing happen in the organization templates section.
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
						<Badge className="rounded-full border border-slate-900/10 bg-white/85 text-slate-700 hover:bg-white">
							<Layers3 className="mr-1.5 size-3.5" />
							Current versions only
						</Badge>
						<Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
							<Sparkles className="mr-1.5 size-3.5" />
							Clone into canvas
						</Badge>
					</div>
				</div>
				{errorMessage ? (
					<div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
						{errorMessage}
					</div>
				) : null}

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
													<Badge variant="outline">
														<Layers3 className="mr-1.5 size-3.5" />
														{formatVersionStackLabel(template.versionCount)}
													</Badge>
													<Badge variant="outline">
														{formatTemplateVisibilityLabel(template.visibility)}
													</Badge>
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
											<div className="flex flex-wrap gap-2">
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
											</div>
										</CardContent>
									</Card>
								);
							})
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function WorkflowTemplateCreateDialog({
	workflow,
	isOpen,
	savingTemplateFromWorkflowId,
	onClose,
	onCreateTemplate,
}: {
	workflow: WorkflowSummary | null;
	isOpen: boolean;
	savingTemplateFromWorkflowId: string | null;
	onClose: () => void;
	onCreateTemplate: (
		workflow: WorkflowSummary,
		templateDraft: Pick<
			WorkflowTemplateDraft,
			"name" | "description" | "visibility"
		>,
	) => Promise<unknown>;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [visibility, setVisibility] =
		useState<WorkflowTemplateVisibility>("organization");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen || !workflow) {
			setErrorMessage(null);
			return;
		}

		setName(workflow.name);
		setDescription(workflow.description ?? "");
		setVisibility("organization");
		setErrorMessage(null);
	}, [isOpen, workflow]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [isOpen]);

	if (!isOpen || !workflow) {
		return null;
	}

	const isSubmitting = savingTemplateFromWorkflowId === workflow.id;

	const submitTemplate = () => {
		setErrorMessage(null);
		void onCreateTemplate(workflow, {
			name,
			description,
			visibility,
		})
			.then(() => {
				onClose();
			})
			.catch((error) => {
				setErrorMessage(
					error instanceof Error
						? error.message
						: "Failed to create workflow template.",
				);
			});
	};

	return (
		<div className="fixed inset-0 z-75 bg-slate-950/65 backdrop-blur-sm">
			<button
				type="button"
				className="absolute inset-0"
				aria-label="Close template creation dialog"
				onClick={() => {
					if (!isSubmitting) {
						onClose();
					}
				}}
			/>
			<div className="absolute inset-x-4 top-10 mx-auto flex max-w-2xl flex-col overflow-hidden rounded-4xl border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,252,244,0.98),rgba(247,251,255,0.98),rgba(241,253,247,0.96))] shadow-[0_30px_120px_rgba(2,6,23,0.45)]">
				<div className="flex items-start justify-between gap-4 border-b border-slate-900/10 bg-white/75 px-5 py-5 backdrop-blur">
					<div className="space-y-2">
						<Badge className="w-fit rounded-full border border-slate-900/10 bg-white/90 text-slate-700 hover:bg-white">
							Create Template
						</Badge>
						<div>
							<h3 className="font-display text-2xl text-slate-900">
								Create template from {workflow.name}
							</h3>
							<p className="max-w-xl text-sm text-slate-600">
								This copies the current graph into a reusable template for your
								organization. Later, edit the template itself to publish new
								versions.
							</p>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={onClose}
						disabled={isSubmitting}
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="space-y-4 px-5 py-5">
					{errorMessage ? (
						<div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
							{errorMessage}
						</div>
					) : null}

					<div className="space-y-1.5">
						<label
							htmlFor="workflow-template-name"
							className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
						>
							Template name
						</label>
						<Input
							id="workflow-template-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="OCR review template"
						/>
					</div>

					<div className="space-y-1.5">
						<label
							htmlFor="workflow-template-description"
							className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
						>
							Description
						</label>
						<textarea
							id="workflow-template-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows={4}
							className="w-full rounded-md border border-slate-900/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900/40 focus:ring-2 focus:ring-sky-200"
						/>
					</div>

					<div className="space-y-1.5">
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
							Visibility
						</p>
						<Select
							value={visibility}
							onValueChange={(value) =>
								setVisibility(value as WorkflowTemplateVisibility)
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select visibility" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="organization">
									Internal to your organization
								</SelectItem>
								<SelectItem value="public">Shared with everyone</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="flex items-center justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={submitTemplate}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Creating..." : "Create template"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export function WorkflowLibraryPanel({
	workflowTemplates,
	workflows,
	startingTemplateId,
	savingTemplateFromWorkflowId,
	onOpenCreate,
	onOpenEdit,
	onOpenEditTemplate,
	onCreateTemplateFromWorkflow,
	onStartFromTemplate,
}: {
	workflowTemplates: DashboardData["workflowTemplates"];
	workflows: DashboardData["workflows"];
	startingTemplateId: string | null;
	savingTemplateFromWorkflowId: string | null;
	onOpenCreate: () => void;
	onOpenEdit: (workflow: DashboardData["workflows"][number]) => void;
	onOpenEditTemplate: (
		workflowTemplate: DashboardData["workflowTemplates"][number],
	) => void;
	onCreateTemplateFromWorkflow: (
		workflow: DashboardData["workflows"][number],
		templateDraft: Pick<
			WorkflowTemplateDraft,
			"name" | "description" | "visibility"
		>,
	) => Promise<unknown>;
	onStartFromTemplate: (workflowTemplate: WorkflowTemplate) => Promise<void>;
}) {
	const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
	const [templateDraftWorkflowId, setTemplateDraftWorkflowId] = useState<
		string | null
	>(null);
	const ownedWorkflowTemplates = useMemo(
		() => workflowTemplates.filter((template) => template.canEdit),
		[workflowTemplates],
	);
	const ownedTemplateCount = ownedWorkflowTemplates.length;
	const sharedTemplateCount = workflowTemplates.length - ownedTemplateCount;
	const internalTemplateCount = ownedWorkflowTemplates.filter(
		(template) => template.visibility === "organization",
	).length;
	const orgSharedTemplateCount = ownedWorkflowTemplates.filter(
		(template) => template.visibility === "public",
	).length;
	const templateDraftWorkflow = templateDraftWorkflowId
		? (workflows.find((workflow) => workflow.id === templateDraftWorkflowId) ??
			null)
		: null;

	return (
		<>
			<div className="space-y-8">
				<Card className="relative overflow-hidden border-slate-900/20 bg-[linear-gradient(120deg,rgba(250,204,21,0.18),rgba(14,165,233,0.12),rgba(34,197,94,0.14))] shadow-[0_18px_40px_rgba(14,165,233,0.15)] md:col-span-2">
					<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(2,6,23,0.3),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(2,6,23,0.25),transparent_35%)] opacity-25" />
					<CardHeader className="relative space-y-2">
						<Badge className="w-fit rounded-full border-slate-900/10 bg-white/80 text-slate-800 hover:bg-white">
							Visual Workflow Builder
						</Badge>
						<CardTitle className="font-display text-2xl text-slate-900">
							Build live workflows, then turn the best ones into templates
						</CardTitle>
						<CardDescription className="max-w-3xl text-slate-700">
							Active agent graphs stay focused on running work. Reusable
							templates are managed separately below, where editing a template
							is the single path to publishing a new version.
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
								New Workflow
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
								<Badge className="rounded-full border border-slate-900/10 bg-white/80 text-slate-700 hover:bg-white">
									{ownedTemplateCount} org-owned
								</Badge>
								<Badge className="rounded-full border border-slate-900/10 bg-white/80 text-slate-700 hover:bg-white">
									{sharedTemplateCount} shared into this library
								</Badge>
								<span className="rounded-full border border-white/60 bg-white/55 px-3 py-1 text-slate-600 backdrop-blur">
									Create templates from active graphs. Edit templates below.
								</span>
							</div>
						) : null}
					</CardContent>
				</Card>

				<div className="space-y-4">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
							Active Graphs
						</p>
						<h3 className="font-display text-2xl text-slate-900">
							Live agent workflows
						</h3>
						<p className="mt-1 max-w-3xl text-sm text-slate-600">
							These are the working graphs attached to devices and daily runs.
							Edit the workflow itself here, or create a reusable template from
							it when the graph is ready to share.
						</p>
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
										Create a workflow or start from a template to begin.
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
													Edit Workflow
												</Button>
												<Button
													type="button"
													variant="outline"
													className="h-8 rounded-full px-3 text-xs"
													onClick={() =>
														setTemplateDraftWorkflowId(workflow.id)
													}
													disabled={savingTemplateFromWorkflowId !== null}
												>
													{savingTemplateFromWorkflowId === workflow.id
														? "Creating..."
														: "Create Template"}
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
													From template: {workflow.template.name}
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

				<div className="space-y-4">
					<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
								Template Library
							</p>
							<h3 className="font-display text-2xl text-slate-900">
								Organization templates
							</h3>
							<p className="mt-1 max-w-3xl text-sm text-slate-600">
								These reusable graphs belong to your organization. Open one to
								edit the graph, then publish the next version from the template
								editor footer.
							</p>
						</div>
						{ownedWorkflowTemplates.length > 0 ? (
							<div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
								<Badge className="rounded-full border border-slate-900/10 bg-white/80 text-slate-700 hover:bg-white">
									{ownedWorkflowTemplates.length} templates
								</Badge>
								<Badge className="rounded-full border border-slate-900/10 bg-white/80 text-slate-700 hover:bg-white">
									{internalTemplateCount} internal
								</Badge>
								<Badge className="rounded-full border border-slate-900/10 bg-white/80 text-slate-700 hover:bg-white">
									{orgSharedTemplateCount} shared
								</Badge>
							</div>
						) : null}
					</div>

					{ownedWorkflowTemplates.length === 0 ? (
						<Card>
							<CardContent className="flex flex-col items-center gap-3 py-12 text-center">
								<div className="rounded-2xl bg-slate-100 p-4">
									<Layers3 className="size-8 text-slate-300" />
								</div>
								<div>
									<p className="font-medium text-slate-500">
										No org templates yet
									</p>
									<p className="mt-1 max-w-xl text-sm text-muted-foreground">
										Create Template from one of your active workflows to build
										your organization&apos;s reusable library. Shared templates
										from elsewhere still appear in Browse Templates.
									</p>
								</div>
							</CardContent>
						</Card>
					) : (
						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{ownedWorkflowTemplates.map((template) => {
								const nodeMix = formatTemplateNodeMix(template);

								return (
									<Card
										key={template.id}
										className="border-slate-900/10 bg-white/88 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
									>
										<CardHeader className="space-y-3 pb-3">
											<div className="flex items-start justify-between gap-3">
												<div className="space-y-2">
													<div className="flex flex-wrap items-center gap-2">
														<CardTitle className="font-display text-lg text-slate-900">
															{template.name}
														</CardTitle>
														<Badge className="rounded-full border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50">
															v{template.version}
														</Badge>
													</div>
													<CardDescription className="text-sm leading-6 text-slate-600">
														{template.description ?? "No description yet."}
													</CardDescription>
												</div>
												<Badge variant="outline">
													{formatTemplateVisibilityLabel(template.visibility)}
												</Badge>
											</div>
										</CardHeader>
										<CardContent className="space-y-4">
											<div className="flex flex-wrap gap-2 text-xs">
												<Badge variant="outline">
													<Layers3 className="mr-1.5 size-3.5" />
													{formatVersionStackLabel(template.versionCount)}
												</Badge>
												<Badge variant="outline">
													Entry: {template.entryNode}
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
											<div className="flex items-center justify-between gap-3 pt-1">
												<p className="text-xs leading-5 text-slate-500">
													Edit this template to publish the next version.
												</p>
												<Button
													type="button"
													variant="outline"
													className="rounded-full px-5"
													onClick={() => onOpenEditTemplate(template)}
												>
													Edit
												</Button>
											</div>
										</CardContent>
									</Card>
								);
							})}
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
			<WorkflowTemplateCreateDialog
				workflow={templateDraftWorkflow}
				isOpen={templateDraftWorkflow !== null}
				savingTemplateFromWorkflowId={savingTemplateFromWorkflowId}
				onClose={() => setTemplateDraftWorkflowId(null)}
				onCreateTemplate={onCreateTemplateFromWorkflow}
			/>
		</>
	);
}
