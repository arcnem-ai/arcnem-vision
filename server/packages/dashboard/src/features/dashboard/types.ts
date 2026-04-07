export type WorkflowModelOption = {
	id: string;
	provider: string;
	name: string;
	type: string | null;
	label: string;
};

export type WorkflowToolOption = {
	id: string;
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	outputSchema: Record<string, unknown>;
	inputFields: string[];
	outputFields: string[];
};

export type WorkflowConfigValue = string | number | boolean | object;
export type WorkflowNodeConfig = Record<string, WorkflowConfigValue>;

export type WorkflowNode = {
	id: string;
	nodeKey: string;
	nodeType: string;
	x: number;
	y: number;
	inputKey: string | null;
	outputKey: string | null;
	modelId: string | null;
	modelLabel: string | null;
	toolIds: string[];
	tools: WorkflowToolOption[];
	toolNames: string[];
	config: WorkflowNodeConfig;
};

export type WorkflowEdge = {
	id: string;
	fromNode: string;
	toNode: string;
};

export type WorkflowNodeTypeCounts = {
	worker: number;
	supervisor: number;
	condition: number;
	tool: number;
	other: number;
};

export type WorkflowNodeSample = {
	id: string;
	nodeKey: string;
	nodeType: string;
	toolNames: string[];
};

export type WorkflowTemplateSummary = {
	id: string;
	name: string;
	description: string | null;
	version: number;
	visibility: string;
	entryNode: string;
	edgeCount: number;
	startedWorkflowCount: number;
	nodeTypeCounts: WorkflowNodeTypeCounts;
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
	nodeSamples: WorkflowNodeSample[];
};

export type DeviceAPIKey = {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
	lastRequest: string | null;
	expiresAt: string | null;
	requestCount: number;
	rateLimitEnabled: boolean;
	rateLimitMax: number;
	rateLimitTimeWindow: number;
};

export type DashboardData = {
	auth: {
		state: "ready" | "missing";
		source: "cookie" | "fallback";
		sessionPreview: string | null;
		userName: string | null;
		userEmail: string | null;
	};
	organization: {
		id: string;
		name: string;
		slug: string;
	} | null;
	projects: Array<{
		id: string;
		name: string;
		slug: string;
		deviceCount: number;
		apiKeyCount: number;
	}>;
	devices: Array<{
		id: string;
		name: string;
		slug: string;
		projectId: string;
		agentGraphId: string;
		workflowName: string | null;
		updatedAt: string;
		status: "connected" | "idle";
		apiKeyCount: number;
		apiKeys: DeviceAPIKey[];
	}>;
	workflows: Array<{
		id: string;
		name: string;
		description: string | null;
		entryNode: string;
		edgeCount: number;
		attachedDeviceCount: number;
		template: {
			id: string;
			name: string;
			version: number | null;
		} | null;
		nodeTypeCounts: WorkflowNodeTypeCounts;
		nodes: WorkflowNode[];
		edges: WorkflowEdge[];
		nodeSamples: WorkflowNodeSample[];
	}>;
	workflowTemplates: WorkflowTemplateSummary[];
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
};

export type StatusMessage = {
	tone: "success" | "error";
	text: string;
};

export type GeneratedDeviceAPIKey = {
	id: string;
	name: string | null;
	value: string;
	start: string | null;
	prefix: string | null;
};

export type WorkflowDraft = {
	name: string;
	description: string;
	entryNode: string;
	nodes: Array<{
		id?: string;
		nodeKey: string;
		nodeType: string;
		x: number;
		y: number;
		inputKey?: string | null;
		outputKey?: string | null;
		modelId?: string | null;
		toolIds?: string[];
		config?: WorkflowNodeConfig;
	}>;
	edges: Array<{
		fromNode: string;
		toNode: string;
	}>;
};
