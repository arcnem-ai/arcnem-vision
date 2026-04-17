import type {
	DashboardData,
	WorkflowDraft,
	WorkflowNodeConfig,
} from "@/features/dashboard/types";

export type EditorNode = WorkflowDraft["nodes"][number] & {
	localId: string;
	inputKey: string | null;
	outputKey: string | null;
	modelId: string | null;
	toolIds: string[];
	config: WorkflowNodeConfig;
	tools: DashboardData["toolCatalog"];
	toolNames: string[];
	modelLabel: string | null;
};

export const CANVAS_NODE_WIDTH = 210;
export const CANVAS_NODE_HEIGHT = 100;

type EditableCanvasGraph =
	| DashboardData["workflows"][number]
	| DashboardData["workflowTemplates"][number];

export function makeLocalId() {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getNodeTypeTone(nodeType: string) {
	switch (nodeType) {
		case "worker":
			return "border-amber-400 bg-amber-50 text-amber-900";
		case "supervisor":
			return "border-sky-400 bg-sky-50 text-sky-900";
		case "condition":
			return "border-violet-400 bg-violet-50 text-violet-900";
		case "tool":
			return "border-emerald-400 bg-emerald-50 text-emerald-900";
		default:
			return "border-slate-400 bg-slate-100 text-slate-900";
	}
}

function buildEditorNode(
	node: WorkflowDraft["nodes"][number],
	overrides?: Pick<EditorNode, "tools" | "toolNames" | "modelLabel">,
): EditorNode {
	return {
		localId: node.id ?? makeLocalId(),
		id: node.id,
		nodeKey: node.nodeKey,
		nodeType: node.nodeType,
		x: node.x,
		y: node.y,
		inputKey: node.inputKey ?? null,
		outputKey: node.outputKey ?? null,
		modelId: node.modelId ?? null,
		toolIds: node.toolIds ?? [],
		config: node.config ?? {},
		tools: overrides?.tools ?? [],
		toolNames: overrides?.toolNames ?? [],
		modelLabel: overrides?.modelLabel ?? null,
	};
}

export function initialDraftFromGraph(
	graph: EditableCanvasGraph | null,
	draftSeed: WorkflowDraft | null = null,
): {
	name: string;
	description: string;
	entryNode: string;
	nodes: EditorNode[];
	edges: WorkflowDraft["edges"];
} {
	if (draftSeed) {
		return {
			name: draftSeed.name,
			description: draftSeed.description ?? "",
			entryNode: draftSeed.entryNode,
			nodes: draftSeed.nodes.map((node) => buildEditorNode(node)),
			edges: draftSeed.edges.map((edge) => ({
				fromNode: edge.fromNode,
				toNode: edge.toNode,
			})),
		};
	}

	if (!graph) {
		const rootId = makeLocalId();
		return {
			name: "",
			description: "",
			entryNode: "start",
			nodes: [
				{
					localId: rootId,
					id: undefined,
					nodeKey: "start",
					nodeType: "worker",
					x: 260,
					y: 200,
					inputKey: "temp_url",
					outputKey: "result",
					modelId: null,
					toolIds: [],
					config: {
						system_message: "",
						max_iterations: 3,
					},
					tools: [],
					toolNames: [],
					modelLabel: null,
				},
			],
			edges: [],
		};
	}

	return {
		name: graph.name,
		description: graph.description ?? "",
		entryNode: graph.entryNode,
		nodes: graph.nodes.map((node) =>
			buildEditorNode(node, {
				tools: node.tools,
				toolNames: node.toolNames,
				modelLabel: node.modelLabel,
			}),
		),
		edges: graph.edges.map((edge) => ({
			fromNode: edge.fromNode,
			toNode: edge.toNode,
		})),
	};
}
