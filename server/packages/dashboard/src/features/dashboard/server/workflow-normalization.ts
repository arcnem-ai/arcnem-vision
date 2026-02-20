import type { WorkflowNodeConfig } from "@/features/dashboard/types";

const NODE_KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const STATE_KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKFLOW_NODE_TYPES = new Set(["worker", "supervisor", "tool"]);

type WorkflowNodeInput = {
	id?: string;
	nodeKey: string;
	nodeType: string;
	x: number;
	y: number;
	inputKey?: string | null;
	outputKey?: string | null;
	modelId?: string | null;
	toolIds?: string[];
	config?: unknown;
};

type WorkflowEdgeInput = {
	fromNode: string;
	toNode: string;
};

function normalizeOptionalStateKey(
	value: string | null | undefined,
	label: string,
): string | null {
	const normalized = value?.trim() ?? "";
	if (!normalized) {
		return null;
	}
	if (normalized.length > 120) {
		throw new Error(`${label} must be 120 characters or fewer.`);
	}
	if (!STATE_KEY_PATTERN.test(normalized)) {
		throw new Error(
			`${label} can include letters, numbers, dots, colons, dashes, and underscores only.`,
		);
	}
	return normalized;
}

function normalizeOptionalUuid(
	value: string | null | undefined,
	label: string,
): string | null {
	if (!value) return null;
	const normalized = value.trim();
	if (!normalized) return null;
	if (!UUID_PATTERN.test(normalized)) {
		throw new Error(`${label} is invalid.`);
	}
	return normalized;
}

function normalizeNodeConfig(config: unknown): WorkflowNodeConfig {
	if (typeof config === "string") {
		try {
			const parsed = JSON.parse(config);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				const normalized = { ...(parsed as WorkflowNodeConfig) };
				delete normalized.uiPosition;
				return normalized;
			}
		} catch {
			return {};
		}
		return {};
	}

	if (!config || typeof config !== "object" || Array.isArray(config)) {
		return {};
	}

	const normalized = { ...(config as WorkflowNodeConfig) };
	delete normalized.uiPosition;
	return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateToolMapping(
	mapping: unknown,
	mappingName: "input_mapping" | "output_mapping",
	nodeKey: string,
) {
	if (mapping == null) return;
	if (!isRecord(mapping)) {
		throw new Error(
			`Tool node "${nodeKey}" must provide ${mappingName} as an object when set.`,
		);
	}
	for (const [field, value] of Object.entries(mapping)) {
		if (typeof value !== "string") {
			throw new Error(
				`Tool node "${nodeKey}" mapping for "${field}" must be a string.`,
			);
		}
		const normalized = value.trim();
		if (!normalized) {
			throw new Error(
				`Tool node "${nodeKey}" mapping for "${field}" cannot be empty.`,
			);
		}
		if (mappingName === "input_mapping" && normalized.startsWith("_const:")) {
			continue;
		}
		if (!STATE_KEY_PATTERN.test(normalized)) {
			throw new Error(
				`Tool node "${nodeKey}" mapping "${field}" must use letters, numbers, dots, colons, dashes, and underscores only.`,
			);
		}
	}
}

export function normalizeWorkflowFields(input: {
	name: string;
	description?: string | null;
	entryNode: string;
}) {
	const name = input.name.trim();
	if (name.length < 2) {
		throw new Error("Workflow name must be at least 2 characters.");
	}
	if (name.length > 120) {
		throw new Error("Workflow name must be 120 characters or fewer.");
	}

	const entryNode = input.entryNode.trim();
	if (entryNode.length < 2) {
		throw new Error("Entry node must be at least 2 characters.");
	}
	if (entryNode.length > 100) {
		throw new Error("Entry node must be 100 characters or fewer.");
	}
	if (!NODE_KEY_PATTERN.test(entryNode)) {
		throw new Error(
			"Entry node can include letters, numbers, dots, colons, dashes, and underscores only.",
		);
	}

	const rawDescription = input.description?.trim() ?? "";
	const description = rawDescription.length === 0 ? null : rawDescription;
	if (description && description.length > 800) {
		throw new Error("Description must be 800 characters or fewer.");
	}

	return {
		name,
		description,
		entryNode,
	};
}

export function parseCanvasPosition(config: unknown, fallbackIndex: number) {
	const fallback = {
		x: 80 + (fallbackIndex % 4) * 220,
		y: 80 + Math.floor(fallbackIndex / 4) * 140,
	};

	let normalizedConfig = config;
	if (typeof normalizedConfig === "string") {
		try {
			normalizedConfig = JSON.parse(normalizedConfig);
		} catch {
			return fallback;
		}
	}

	if (
		!normalizedConfig ||
		typeof normalizedConfig !== "object" ||
		Array.isArray(normalizedConfig) ||
		!("uiPosition" in normalizedConfig)
	) {
		return fallback;
	}

	const uiPosition = (normalizedConfig as { uiPosition?: unknown }).uiPosition;
	if (
		!uiPosition ||
		typeof uiPosition !== "object" ||
		Array.isArray(uiPosition)
	) {
		return fallback;
	}

	const x = (uiPosition as { x?: unknown }).x;
	const y = (uiPosition as { y?: unknown }).y;

	if (typeof x !== "number" || typeof y !== "number") {
		return fallback;
	}

	return { x, y };
}

export function normalizeGraphData(input: {
	entryNode: string;
	nodes: WorkflowNodeInput[];
	edges: WorkflowEdgeInput[];
}) {
	if (input.nodes.length === 0) {
		throw new Error("Add at least one node to the workflow canvas.");
	}

	const normalizedNodes = input.nodes.map((node) => {
		const nodeKey = node.nodeKey.trim();
		if (nodeKey.length < 2) {
			throw new Error("Each node key must be at least 2 characters.");
		}
		if (nodeKey.length > 120) {
			throw new Error("Node keys must be 120 characters or fewer.");
		}
		if (!NODE_KEY_PATTERN.test(nodeKey)) {
			throw new Error(
				`Node key "${nodeKey}" has invalid characters. Use letters, numbers, dots, colons, dashes, and underscores only.`,
			);
		}

		const nodeType = node.nodeType.trim().toLowerCase();
		if (!WORKFLOW_NODE_TYPES.has(nodeType)) {
			throw new Error(
				`Node "${nodeKey}" has unsupported type "${node.nodeType}". Use worker, supervisor, or tool.`,
			);
		}

		const x = Number.isFinite(node.x) ? Math.round(node.x) : 80;
		const y = Number.isFinite(node.y) ? Math.round(node.y) : 80;
		const inputKey = normalizeOptionalStateKey(
			node.inputKey,
			`Input key for node "${nodeKey}"`,
		);
		const outputKey = normalizeOptionalStateKey(
			node.outputKey,
			`Output key for node "${nodeKey}"`,
		);
		const modelId = normalizeOptionalUuid(
			node.modelId,
			`Model id for node "${nodeKey}"`,
		);
		const toolIds = Array.from(
			new Set(
				(node.toolIds ?? [])
					.map((toolId) => toolId.trim())
					.filter((toolId) => toolId.length > 0),
			),
		);
		for (const toolId of toolIds) {
			if (!UUID_PATTERN.test(toolId)) {
				throw new Error(`Tool id "${toolId}" on node "${nodeKey}" is invalid.`);
			}
		}

		const config = normalizeNodeConfig(node.config);

		switch (nodeType) {
			case "worker": {
				if (!modelId) {
					throw new Error(`Worker node "${nodeKey}" requires a model.`);
				}
				const systemMessage = config.system_message;
				if (systemMessage != null && typeof systemMessage !== "string") {
					throw new Error(
						`Worker node "${nodeKey}" must set system_message as a string.`,
					);
				}
				const maxIterations = config.max_iterations;
				if (
					maxIterations != null &&
					(!Number.isInteger(maxIterations) ||
						Number(maxIterations) < 1 ||
						Number(maxIterations) > 100)
				) {
					throw new Error(
						`Worker node "${nodeKey}" max_iterations must be an integer between 1 and 100.`,
					);
				}
				break;
			}
			case "supervisor": {
				if (!modelId) {
					throw new Error(`Supervisor node "${nodeKey}" requires a model.`);
				}
				if (toolIds.length > 0) {
					throw new Error(
						`Supervisor node "${nodeKey}" cannot have attached tools.`,
					);
				}
				const members = config.members;
				if (!Array.isArray(members) || members.length === 0) {
					throw new Error(
						`Supervisor node "${nodeKey}" must define at least one member in config.members.`,
					);
				}
				const normalizedMembers: string[] = [];
				const seenMembers = new Set<string>();
				for (const member of members) {
					if (typeof member !== "string") {
						throw new Error(
							`Supervisor node "${nodeKey}" has invalid member value.`,
						);
					}
					const memberKey = member.trim();
					if (!NODE_KEY_PATTERN.test(memberKey)) {
						throw new Error(
							`Supervisor node "${nodeKey}" has invalid member value.`,
						);
					}
					if (seenMembers.has(memberKey)) {
						throw new Error(
							`Supervisor node "${nodeKey}" has duplicate member "${memberKey}".`,
						);
					}
					seenMembers.add(memberKey);
					normalizedMembers.push(memberKey);
				}
				config.members = normalizedMembers;
				break;
			}
			case "tool": {
				if (toolIds.length !== 1) {
					throw new Error(
						`Tool node "${nodeKey}" must have exactly one attached tool.`,
					);
				}
				if (modelId) {
					throw new Error(`Tool node "${nodeKey}" cannot set a model.`);
				}
				validateToolMapping(config.input_mapping, "input_mapping", nodeKey);
				validateToolMapping(config.output_mapping, "output_mapping", nodeKey);
				break;
			}
		}

		return {
			id: node.id,
			nodeKey,
			nodeType,
			x: Math.max(0, x),
			y: Math.max(0, y),
			inputKey,
			outputKey,
			modelId,
			toolIds,
			config,
		};
	});

	const seenKeys = new Set<string>();
	for (const node of normalizedNodes) {
		if (seenKeys.has(node.nodeKey)) {
			throw new Error(`Duplicate node key detected: "${node.nodeKey}".`);
		}
		seenKeys.add(node.nodeKey);
	}

	if (!seenKeys.has(input.entryNode)) {
		throw new Error(
			"Entry node must match one of the node keys on the canvas.",
		);
	}

	const nodeTypeByKey = new Map(
		normalizedNodes.map((node) => [node.nodeKey, node.nodeType]),
	);
	for (const node of normalizedNodes) {
		if (node.nodeType !== "supervisor") continue;
		const members = node.config.members as unknown[];
		for (const member of members) {
			const memberKey = String(member).trim();
			const memberType = nodeTypeByKey.get(memberKey);
			if (!memberType) {
				throw new Error(
					`Supervisor node "${node.nodeKey}" references unknown member "${memberKey}".`,
				);
			}
			if (memberType !== "worker") {
				throw new Error(
					`Supervisor node "${node.nodeKey}" member "${memberKey}" must be a worker node.`,
				);
			}
		}
	}

	const normalizedEdges = input.edges.map((edge) => {
		const fromNode = edge.fromNode.trim();
		const toNode = edge.toNode.trim();

		if (!seenKeys.has(fromNode)) {
			throw new Error(
				`Edge "${fromNode} -> ${toNode}" references a source node that does not exist.`,
			);
		}
		if (toNode !== "END" && !seenKeys.has(toNode)) {
			throw new Error(
				`Edge "${fromNode} -> ${toNode}" references a node that does not exist.`,
			);
		}
		if (fromNode === toNode) {
			throw new Error(`Edge "${fromNode}" cannot point to itself.`);
		}
		return { fromNode, toNode };
	});

	const edgeKeys = new Set<string>();
	for (const edge of normalizedEdges) {
		const edgeKey = `${edge.fromNode}->${edge.toNode}`;
		if (edgeKeys.has(edgeKey)) {
			throw new Error(`Duplicate edge detected: ${edgeKey}.`);
		}
		edgeKeys.add(edgeKey);
	}

	if (!normalizedEdges.some((edge) => edge.toNode === "END")) {
		throw new Error("Add at least one edge that points to END.");
	}

	const adjacency = new Map<string, string[]>();
	for (const edge of normalizedEdges) {
		const next = adjacency.get(edge.fromNode) ?? [];
		next.push(edge.toNode);
		adjacency.set(edge.fromNode, next);
	}

	const visited = new Set<string>();
	const queue = [input.entryNode];
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
		throw new Error("Entry node must have a path to END.");
	}

	return {
		nodes: normalizedNodes,
		edges: normalizedEdges,
	};
}
