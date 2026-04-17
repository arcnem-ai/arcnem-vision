import type {
	DashboardData,
	StatusMessage,
	WorkflowDraft,
	WorkflowTemplateDraft,
} from "@/features/dashboard/types";

export type CanvasTarget =
	| { kind: "workflow-create"; draftSeed: WorkflowDraft | null }
	| { kind: "workflow"; id: string }
	| { kind: "template"; id: string }
	| null;

export type WorkflowSummary = DashboardData["workflows"][number];
export type WorkflowTemplateSummary =
	DashboardData["workflowTemplates"][number];
export type TemplateDraftSeed = Pick<
	WorkflowTemplateDraft,
	"name" | "description" | "visibility"
>;

export type DashboardWorkflowLibraryController = {
	startingTemplateId: string | null;
	savingTemplateFromWorkflowId: string | null;
	generatingWorkflowDraft: boolean;
	onOpenCreate: () => void;
	onOpenEdit: (workflow: WorkflowSummary) => void;
	onOpenEditTemplate: (template: WorkflowTemplateSummary) => void;
	onGenerateDraft: (workflowDescription: string) => Promise<void>;
	onCreateTemplateFromWorkflow: (
		workflow: WorkflowSummary,
		templateDraft: TemplateDraftSeed,
	) => Promise<unknown>;
	onStartFromTemplate: (template: WorkflowTemplateSummary) => Promise<void>;
};

export type DashboardWorkflowCanvasController = {
	isOpen: boolean;
	mode: "workflow-create" | "workflow-edit" | "template-edit";
	draftSeed: WorkflowDraft | null;
	workflow: WorkflowSummary | null;
	template: WorkflowTemplateSummary | null;
	saveMessage: StatusMessage | null;
	creatingWorkflow: boolean;
	updatingWorkflowId: string | null;
	updatingTemplateId: string | null;
	onClose: () => void;
	onCreateWorkflow: (draft: WorkflowDraft) => Promise<void>;
	onUpdateWorkflow: (workflowId: string, draft: WorkflowDraft) => Promise<void>;
	onUpdateTemplate: (
		templateId: string,
		draft: WorkflowTemplateDraft,
	) => Promise<void>;
};
