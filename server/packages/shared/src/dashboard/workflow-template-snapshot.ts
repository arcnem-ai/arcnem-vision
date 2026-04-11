import type { WorkflowDraft, WorkflowNodeConfig } from "../contracts/dashboard";
import {
	normalizeGraphData,
	normalizeWorkflowFields,
} from "./workflow-normalization";

export type WorkflowTemplateSnapshot = {
	name: string;
	description: string | null;
	entryNode: string;
	stateSchema: Record<string, unknown> | null;
	nodes: Array<{
		nodeKey: string;
		nodeType: string;
		x: number;
		y: number;
		inputKey: string | null;
		outputKey: string | null;
		modelId: string | null;
		toolIds: string[];
		config: WorkflowNodeConfig;
	}>;
	edges: Array<{
		fromNode: string;
		toNode: string;
	}>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

export function normalizePersistedWorkflowNodeConfig(
	config: unknown,
): WorkflowNodeConfig {
	if (typeof config === "string") {
		try {
			const parsed = JSON.parse(config);
			if (!isPlainObject(parsed)) {
				return {};
			}
			const normalized = { ...(parsed as WorkflowNodeConfig) };
			delete normalized.uiPosition;
			return normalized;
		} catch {
			return {};
		}
	}

	if (!isPlainObject(config)) {
		return {};
	}

	const normalized = { ...(config as WorkflowNodeConfig) };
	delete normalized.uiPosition;
	return normalized;
}

export function normalizeWorkflowStateSchema(
	stateSchema: unknown,
): Record<string, unknown> | null {
	if (typeof stateSchema === "string") {
		try {
			const parsed = JSON.parse(stateSchema);
			return isPlainObject(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	return isPlainObject(stateSchema) ? stateSchema : null;
}

export function createWorkflowTemplateSnapshot(input: {
	name: string;
	description?: string | null;
	entryNode: string;
	stateSchema?: unknown;
	nodes: WorkflowDraft["nodes"];
	edges: WorkflowDraft["edges"];
}): WorkflowTemplateSnapshot {
	const fields = normalizeWorkflowFields(input);
	const graph = normalizeGraphData({
		entryNode: fields.entryNode,
		nodes: input.nodes,
		edges: input.edges,
	});

	return {
		name: fields.name,
		description: fields.description,
		entryNode: fields.entryNode,
		stateSchema: normalizeWorkflowStateSchema(input.stateSchema),
		nodes: graph.nodes.map((node) => ({
			nodeKey: node.nodeKey,
			nodeType: node.nodeType,
			x: node.x,
			y: node.y,
			inputKey: node.inputKey,
			outputKey: node.outputKey,
			modelId: node.modelId,
			toolIds: node.toolIds,
			config: node.config,
		})),
		edges: graph.edges.map((edge) => ({
			fromNode: edge.fromNode,
			toNode: edge.toNode,
		})),
	};
}

export function parseWorkflowTemplateSnapshot(
	snapshot: unknown,
): WorkflowTemplateSnapshot | null {
	if (!isPlainObject(snapshot)) {
		return null;
	}

	const rawNodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
	const rawEdges = Array.isArray(snapshot.edges) ? snapshot.edges : [];

	try {
		return createWorkflowTemplateSnapshot({
			name: typeof snapshot.name === "string" ? snapshot.name : "",
			description:
				typeof snapshot.description === "string" ? snapshot.description : null,
			entryNode:
				typeof snapshot.entryNode === "string" ? snapshot.entryNode : "",
			stateSchema: snapshot.stateSchema,
			nodes: rawNodes.map((node) => {
				const rawNode = isPlainObject(node) ? node : {};
				return {
					nodeKey: typeof rawNode.nodeKey === "string" ? rawNode.nodeKey : "",
					nodeType:
						typeof rawNode.nodeType === "string" ? rawNode.nodeType : "",
					x: typeof rawNode.x === "number" ? rawNode.x : 80,
					y: typeof rawNode.y === "number" ? rawNode.y : 80,
					inputKey:
						typeof rawNode.inputKey === "string" ? rawNode.inputKey : null,
					outputKey:
						typeof rawNode.outputKey === "string" ? rawNode.outputKey : null,
					modelId: typeof rawNode.modelId === "string" ? rawNode.modelId : null,
					toolIds: Array.isArray(rawNode.toolIds)
						? rawNode.toolIds.filter(
								(toolId): toolId is string => typeof toolId === "string",
							)
						: [],
					config: normalizePersistedWorkflowNodeConfig(rawNode.config),
				};
			}),
			edges: rawEdges.map((edge) => {
				const rawEdge = isPlainObject(edge) ? edge : {};
				return {
					fromNode:
						typeof rawEdge.fromNode === "string" ? rawEdge.fromNode : "",
					toNode: typeof rawEdge.toNode === "string" ? rawEdge.toNode : "",
				};
			}),
		});
	} catch {
		return null;
	}
}
