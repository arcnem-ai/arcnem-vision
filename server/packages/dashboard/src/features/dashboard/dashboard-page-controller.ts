import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
	createWorkflow,
	createWorkflowFromTemplate,
	createWorkflowTemplateFromWorkflow,
	generateWorkflowDraft,
	updateWorkflow,
	updateWorkflowTemplate,
} from "@/features/dashboard/server-fns";
import type {
	DashboardData,
	StatusMessage,
	WorkflowDraft,
	WorkflowTemplateDraft,
} from "@/features/dashboard/types";
import type {
	CanvasTarget,
	DashboardWorkflowCanvasController,
	DashboardWorkflowLibraryController,
	TemplateDraftSeed,
	WorkflowSummary,
	WorkflowTemplateSummary,
} from "./dashboard-page-controller.types";

export function useDashboardPageController(dashboard: DashboardData) {
	const router = useRouter();
	const createWorkflowFn = useServerFn(createWorkflow);
	const createWorkflowFromTemplateFn = useServerFn(createWorkflowFromTemplate);
	const createWorkflowTemplateFromWorkflowFn = useServerFn(
		createWorkflowTemplateFromWorkflow,
	);
	const generateWorkflowDraftFn = useServerFn(generateWorkflowDraft);
	const updateWorkflowFn = useServerFn(updateWorkflow);
	const updateWorkflowTemplateFn = useServerFn(updateWorkflowTemplate);

	const [creatingWorkflow, setCreatingWorkflow] = useState(false);
	const [generatingWorkflowDraft, setGeneratingWorkflowDraft] = useState(false);
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
		workflow: WorkflowSummary,
		templateDraft: TemplateDraftSeed,
	) => {
		setSavingTemplateFromWorkflowId(workflow.id);
		try {
			const template = await createWorkflowTemplateFromWorkflowFn({
				data: {
					workflowId: workflow.id,
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

	const startWorkflowFromTemplate = async (
		template: WorkflowTemplateSummary,
	) => {
		setStartingTemplateId(template.id);
		try {
			const workflow = await createWorkflowFromTemplateFn({
				data: {
					templateId: template.id,
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

	const generateDraftFromDescription = async (workflowDescription: string) => {
		setGeneratingWorkflowDraft(true);
		setEditorMessage(null);
		try {
			const response = await generateWorkflowDraftFn({
				data: {
					workflowDescription,
				},
			});
			setCanvasTarget({
				kind: "workflow-create",
				draftSeed: response.draft,
			});
			setPendingCanvasTarget(null);
		} finally {
			setGeneratingWorkflowDraft(false);
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
	const activeCreateDraftSeed =
		canvasTarget?.kind === "workflow-create" ? canvasTarget.draftSeed : null;
	const hasOrganizations = dashboard.organizations.length > 0;

	return {
		canvas: {
			isOpen: canvasTarget !== null,
			mode:
				canvasTarget?.kind === "template"
					? "template-edit"
					: canvasTarget?.kind === "workflow"
						? "workflow-edit"
						: "workflow-create",
			draftSeed: activeCreateDraftSeed,
			workflow: activeCanvasWorkflow,
			template: activeCanvasTemplate,
			saveMessage: editorMessage,
			creatingWorkflow,
			updatingWorkflowId,
			updatingTemplateId,
			onClose: () => {
				setCanvasTarget(null);
			},
			onCreateWorkflow: createWorkflowDraft,
			onUpdateWorkflow: updateWorkflowDraft,
			onUpdateTemplate: updateTemplateDraft,
		} satisfies DashboardWorkflowCanvasController,
		library: {
			startingTemplateId,
			savingTemplateFromWorkflowId,
			generatingWorkflowDraft,
			onOpenCreate: () => {
				setCanvasTarget({
					kind: "workflow-create",
					draftSeed: null,
				});
				setPendingCanvasTarget(null);
				setEditorMessage(null);
			},
			onOpenEdit: (workflow) => {
				setCanvasTarget({
					kind: "workflow",
					id: workflow.id,
				});
				setPendingCanvasTarget(null);
				setEditorMessage(null);
			},
			onOpenEditTemplate: (template) => {
				setCanvasTarget({
					kind: "template",
					id: template.id,
				});
				setPendingCanvasTarget(null);
				setEditorMessage(null);
			},
			onGenerateDraft: generateDraftFromDescription,
			onCreateTemplateFromWorkflow: createTemplateFromWorkflow,
			onStartFromTemplate: startWorkflowFromTemplate,
		} satisfies DashboardWorkflowLibraryController,
		showCreateOrganization:
			dashboard.auth.state === "ready" && !hasOrganizations,
		showWorkspace: dashboard.auth.state === "ready" && hasOrganizations,
	};
}
