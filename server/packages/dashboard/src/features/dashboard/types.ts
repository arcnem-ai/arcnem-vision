export type {
	DashboardData,
	GeneratedAPIKey,
	GeneratedServiceAPIKey,
	GeneratedWorkflowAPIKey,
	ServiceAPIKey,
	WorkflowAPIKey,
	WorkflowDraft,
	WorkflowEdge,
	WorkflowModelOption,
	WorkflowNode,
	WorkflowNodeConfig,
	WorkflowNodeSample,
	WorkflowNodeTypeCounts,
	WorkflowSchemaObject,
	WorkflowTemplateDraft,
	WorkflowTemplateSummary,
	WorkflowTemplateVisibility,
	WorkflowToolOption,
} from "@arcnem-vision/shared";

export type StatusMessage = {
	tone: "success" | "error";
	text: string;
};
