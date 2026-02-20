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
	inputSchema: unknown;
	outputSchema: unknown;
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
	}>;
	workflows: Array<{
		id: string;
		name: string;
		description: string | null;
		entryNode: string;
		edgeCount: number;
		attachedDeviceCount: number;
		nodeTypeCounts: {
			worker: number;
			supervisor: number;
			tool: number;
			other: number;
		};
		nodes: WorkflowNode[];
		edges: WorkflowEdge[];
		nodeSamples: Array<{
			id: string;
			nodeKey: string;
			nodeType: string;
			toolNames: string[];
		}>;
	}>;
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
};

export type StatusMessage = {
	tone: "success" | "error";
	text: string;
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
