import type {
	WorkflowDraft,
	WorkflowModelOption,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import type { EditorNode } from "./shared";

const KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown) {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function validateCanvasGraph({
	nodes,
	entryNode,
	edges,
	modelCatalog,
	toolCatalog,
}: {
	nodes: EditorNode[];
	entryNode: string;
	edges: WorkflowDraft["edges"];
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
}) {
	if (nodes.length === 0) return "Add at least one node to the canvas.";

	const modelIds = new Set(modelCatalog.map((model) => model.id));
	const toolIds = new Set(toolCatalog.map((tool) => tool.id));
	const seenNodeKeys = new Set<string>();
	const nodeTypeByKey = new Map<string, string>();

	for (const node of nodes) {
		if (node.nodeKey.trim().length < 2) {
			return "Every node key must be at least 2 characters.";
		}
		if (!KEY_PATTERN.test(node.nodeKey.trim())) {
			return "Node keys can only use letters, numbers, dots, colons, dashes, and underscores.";
		}
		const normalized = node.nodeKey.trim();
		if (seenNodeKeys.has(normalized)) {
			return `Duplicate node key: ${normalized}.`;
		}
		seenNodeKeys.add(normalized);
		nodeTypeByKey.set(normalized, node.nodeType);

		if (!["worker", "supervisor", "tool"].includes(node.nodeType)) {
			return `Node ${normalized} must be worker, supervisor, or tool.`;
		}

		for (const stateKey of [node.inputKey, node.outputKey]) {
			if (!stateKey) continue;
			if (!KEY_PATTERN.test(stateKey.trim())) {
				return `Node ${normalized} has an invalid state key.`;
			}
		}

		if (node.nodeType === "worker" || node.nodeType === "supervisor") {
			if (!node.modelId) {
				return `Node ${normalized} requires a model.`;
			}
			if (!modelIds.has(node.modelId)) {
				return `Node ${normalized} references an unknown model.`;
			}
		}

		const config = isRecord(node.config) ? node.config : {};
		if (node.nodeType === "worker") {
			const uniqueToolIds = new Set(node.toolIds);
			if (uniqueToolIds.size !== node.toolIds.length) {
				return `Worker ${normalized} has duplicate tool assignments.`;
			}
			for (const toolId of uniqueToolIds) {
				if (!toolIds.has(toolId)) {
					return `Worker ${normalized} references an unknown tool.`;
				}
			}
			if (
				config.max_iterations != null &&
				(!Number.isInteger(config.max_iterations) ||
					Number(config.max_iterations) < 1 ||
					Number(config.max_iterations) > 100)
			) {
				return `Worker ${normalized} max_iterations must be between 1 and 100.`;
			}
		}

		if (node.nodeType === "supervisor") {
			if (node.toolIds.length > 0) {
				return `Supervisor ${normalized} cannot have tools assigned.`;
			}
			const members = asStringArray(config.members);
			if (members.length === 0) {
				return `Supervisor ${normalized} needs at least one member.`;
			}
			if (new Set(members).size !== members.length) {
				return `Supervisor ${normalized} has duplicate members in config.members.`;
			}
		}

		if (node.nodeType === "tool") {
			if (node.modelId) {
				return `Tool node ${normalized} cannot set a model.`;
			}
			if (node.toolIds.length !== 1) {
				return `Tool node ${normalized} needs exactly one tool.`;
			}
			if (!toolIds.has(node.toolIds[0])) {
				return `Tool node ${normalized} references an unknown tool.`;
			}
			const inputMapping = config.input_mapping;
			const outputMapping = config.output_mapping;
			for (const [mappingName, mapping] of [
				["input_mapping", inputMapping],
				["output_mapping", outputMapping],
			] as const) {
				if (mapping == null) continue;
				if (!isRecord(mapping)) {
					return `Tool node ${normalized} ${mappingName} must be an object.`;
				}
				for (const value of Object.values(mapping)) {
					if (typeof value !== "string" || value.trim().length === 0) {
						return `Tool node ${normalized} has an invalid ${mappingName} value.`;
					}
					if (
						mappingName === "input_mapping" &&
						value.trim().startsWith("_const:")
					) {
						continue;
					}
					if (!KEY_PATTERN.test(value.trim())) {
						return `Tool node ${normalized} has an invalid ${mappingName} key reference.`;
					}
				}
			}
		}
	}

	if (!seenNodeKeys.has(entryNode.trim())) {
		return "Entry node must match one node key in the canvas.";
	}

	for (const node of nodes) {
		if (node.nodeType !== "supervisor") continue;
		const config = isRecord(node.config) ? node.config : {};
		const members = asStringArray(config.members);
		for (const member of members) {
			if (!seenNodeKeys.has(member)) {
				return `Supervisor ${node.nodeKey} references unknown member ${member}.`;
			}
			if (nodeTypeByKey.get(member) !== "worker") {
				return `Supervisor ${node.nodeKey} member ${member} must be a worker.`;
			}
		}
	}

	const seenEdges = new Set<string>();
	for (const edge of edges) {
		if (!seenNodeKeys.has(edge.fromNode)) {
			return `Edge ${edge.fromNode} -> ${edge.toNode} references a missing source node.`;
		}
		if (edge.toNode !== "END" && !seenNodeKeys.has(edge.toNode)) {
			return `Edge ${edge.fromNode} -> ${edge.toNode} references a missing node.`;
		}
		if (edge.fromNode === edge.toNode) {
			return `Edge ${edge.fromNode} cannot point to itself.`;
		}
		const edgeKey = `${edge.fromNode}->${edge.toNode}`;
		if (seenEdges.has(edgeKey)) {
			return `Duplicate edge: ${edgeKey}.`;
		}
		seenEdges.add(edgeKey);
	}

	if (!edges.some((edge) => edge.toNode === "END")) {
		return "Add at least one edge to END so the workflow can finish.";
	}

	const adjacency = new Map<string, string[]>();
	for (const edge of edges) {
		const next = adjacency.get(edge.fromNode) ?? [];
		next.push(edge.toNode);
		adjacency.set(edge.fromNode, next);
	}

	const entry = entryNode.trim();
	const visited = new Set<string>();
	const queue = [entry];
	let reachesEnd = false;

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || visited.has(current)) continue;
		visited.add(current);
		for (const next of adjacency.get(current) ?? []) {
			if (next === "END") {
				reachesEnd = true;
				break;
			}
			if (!visited.has(next)) {
				queue.push(next);
			}
		}
		if (reachesEnd) break;
	}

	if (!reachesEnd) {
		return "Entry node must have a path to END.";
	}

	return null;
}

export function buildUniqueNodeKey(
	candidate: string,
	existingNodeKeys: string[],
) {
	const normalized = candidate.trim().toLowerCase().replace(/\s+/g, "_");
	const base =
		normalized.replace(/[^a-z0-9._:-]/g, "_").replace(/^_+|_+$/g, "") || "node";
	const existing = new Set(existingNodeKeys);
	if (!existing.has(base)) return base;
	let index = 2;
	while (existing.has(`${base}_${index}`)) {
		index += 1;
	}
	return `${base}_${index}`;
}
