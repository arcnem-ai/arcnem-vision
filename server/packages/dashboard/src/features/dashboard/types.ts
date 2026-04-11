export type {
	DashboardData,
	DeviceAPIKey,
	GeneratedDeviceAPIKey,
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
