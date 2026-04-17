import type { WorkflowDraft } from "@arcnem-vision/shared";

type LayoutNode = {
	nodeKey: string;
	nodeType: string;
	config: Record<string, unknown>;
};

function appendAdjacency(
	adjacency: Map<string, string[]>,
	fromNode: string,
	toNode: string,
) {
	const next = adjacency.get(fromNode) ?? [];
	if (!next.includes(toNode)) {
		next.push(toNode);
	}
	adjacency.set(fromNode, next);
}

export function computeWorkflowLayout(input: {
	entryNode: string;
	nodes: LayoutNode[];
	edges: WorkflowDraft["edges"];
}) {
	const adjacency = new Map<string, string[]>();
	for (const node of input.nodes) {
		adjacency.set(node.nodeKey, []);
	}

	for (const edge of input.edges) {
		if (edge.toNode !== "END") {
			appendAdjacency(adjacency, edge.fromNode, edge.toNode);
		}
	}

	for (const node of input.nodes) {
		if (node.nodeType !== "supervisor") continue;
		const members = Array.isArray(node.config.members)
			? node.config.members.filter(
					(member): member is string => typeof member === "string",
				)
			: [];
		for (const member of members) {
			appendAdjacency(adjacency, node.nodeKey, member);
		}
	}

	const depths = new Map<string, number>([[input.entryNode, 0]]);
	const queue = [input.entryNode];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) continue;
		const currentDepth = depths.get(current) ?? 0;
		for (const next of adjacency.get(current) ?? []) {
			const nextDepth = currentDepth + 1;
			if (!depths.has(next) || (depths.get(next) ?? 0) > nextDepth) {
				depths.set(next, nextDepth);
				queue.push(next);
			}
		}
	}

	const nodesByDepth = new Map<number, string[]>();
	for (const node of input.nodes) {
		const depth = depths.get(node.nodeKey) ?? 0;
		const bucket = nodesByDepth.get(depth) ?? [];
		bucket.push(node.nodeKey);
		nodesByDepth.set(depth, bucket);
	}

	const positions = new Map<string, { x: number; y: number }>();
	for (const [depth, nodeKeys] of nodesByDepth) {
		nodeKeys.sort();
		nodeKeys.forEach((nodeKey, index) => {
			positions.set(nodeKey, {
				x: 120 + depth * 260,
				y: 120 + index * 170,
			});
		});
	}

	return positions;
}
