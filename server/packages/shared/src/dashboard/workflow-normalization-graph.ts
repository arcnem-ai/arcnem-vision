import {
	appendAdjacency,
	NODE_KEY_PATTERN,
	normalizeConditionTarget,
	normalizeNodeConfig,
	normalizeOptionalStateKey,
	normalizeOptionalUuid,
	validateToolMapping,
	WORKFLOW_NODE_TYPES,
	type WorkflowEdgeInput,
	type WorkflowNodeInput,
} from "./workflow-normalization-shared";

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
			throw new Error(`Node "${nodeKey}" has unsupported type "${nodeType}".`);
		}

		const inputKey = normalizeOptionalStateKey(
			node.inputKey,
			`Node "${nodeKey}" inputKey`,
		);
		const outputKey = normalizeOptionalStateKey(
			node.outputKey,
			`Node "${nodeKey}" outputKey`,
		);
		const modelId = normalizeOptionalUuid(node.modelId);
		const toolIds = Array.from(
			new Set(
				(node.toolIds ?? [])
					.map((toolId) => toolId.trim())
					.filter((toolId) => toolId.length > 0),
			),
		);
		const config = normalizeNodeConfig(node.config);

		if (nodeType === "worker" || nodeType === "supervisor") {
			if (!modelId) {
				throw new Error(`Node "${nodeKey}" must select a model.`);
			}
		}

		if (nodeType === "tool" && toolIds.length === 0) {
			throw new Error(`Tool node "${nodeKey}" must select at least one tool.`);
		}
		if (nodeType !== "tool" && toolIds.length > 0) {
			throw new Error(`Only tool nodes can reference tools.`);
		}

		if (nodeType === "tool") {
			validateToolMapping(config.input_mapping, "input_mapping", nodeKey);
			validateToolMapping(config.output_mapping, "output_mapping", nodeKey);
		}

		if (nodeType === "condition") {
			const sourceKey = normalizeOptionalStateKey(
				typeof config.source_key === "string" ? config.source_key : null,
				`Condition node "${nodeKey}" source_key`,
			);
			if (!sourceKey) {
				throw new Error(`Condition node "${nodeKey}" must set source_key.`);
			}
			const operator =
				typeof config.operator === "string"
					? config.operator.trim().toLowerCase()
					: "";
			if (!["equals", "contains"].includes(operator)) {
				throw new Error(
					`Condition node "${nodeKey}" must use operator equals or contains.`,
				);
			}
			if (
				typeof config.value !== "string" ||
				config.value.trim().length === 0
			) {
				throw new Error(
					`Condition node "${nodeKey}" must set a non-empty value for operator ${operator}.`,
				);
			}

			config.true_target = normalizeConditionTarget(
				config.true_target,
				nodeKey,
				"true_target",
			);
			config.false_target = normalizeConditionTarget(
				config.false_target,
				nodeKey,
				"false_target",
			);
			if (config.true_target === config.false_target) {
				throw new Error(
					`Condition node "${nodeKey}" must branch to two different targets.`,
				);
			}
			config.source_key = sourceKey;
			config.operator = operator;
		}

		if (nodeType === "supervisor") {
			const members = Array.isArray(config.members) ? config.members : [];
			const normalizedMembers = members.map((member) =>
				typeof member === "string" ? member.trim() : "",
			);
			if (normalizedMembers.length === 0) {
				throw new Error(`Supervisor node "${nodeKey}" must list members.`);
			}
			if (normalizedMembers.some((member) => member.length === 0)) {
				throw new Error(
					`Supervisor node "${nodeKey}" cannot include empty members.`,
				);
			}
			if (new Set(normalizedMembers).size !== normalizedMembers.length) {
				throw new Error(
					`Supervisor node "${nodeKey}" cannot include duplicate members.`,
				);
			}
			if (normalizedMembers.some((member) => !NODE_KEY_PATTERN.test(member))) {
				throw new Error(
					`Supervisor node "${nodeKey}" members must use valid node keys.`,
				);
			}
			if (config.finish_target != null) {
				if (typeof config.finish_target !== "string") {
					throw new Error(
						`Supervisor node "${nodeKey}" finish_target must be a string.`,
					);
				}
				const finishTarget = config.finish_target.trim();
				if (finishTarget === "END") {
					throw new Error(
						`Supervisor node "${nodeKey}" should omit finish_target to end directly.`,
					);
				}
				if (finishTarget && !NODE_KEY_PATTERN.test(finishTarget)) {
					throw new Error(
						`Supervisor node "${nodeKey}" has invalid finish_target "${finishTarget}".`,
					);
				}
				config.finish_target = finishTarget;
			}
			config.members = normalizedMembers;
		}

		return {
			id: node.id?.trim() || undefined,
			nodeKey,
			nodeType,
			x: node.x,
			y: node.y,
			inputKey,
			outputKey,
			modelId,
			toolIds,
			config,
		};
	});

	const nodeByKey = new Map(
		normalizedNodes.map((node) => [node.nodeKey, node] as const),
	);
	if (!nodeByKey.has(input.entryNode)) {
		throw new Error(`Entry node "${input.entryNode}" does not exist.`);
	}

	for (const node of normalizedNodes) {
		if (node.nodeType !== "supervisor") {
			continue;
		}
		const members = Array.isArray(node.config.members)
			? (node.config.members as string[])
			: [];
		for (const member of members) {
			const memberNode = nodeByKey.get(member);
			if (!memberNode) {
				throw new Error(
					`Supervisor node "${node.nodeKey}" references missing member "${member}".`,
				);
			}
			if (memberNode.nodeType !== "worker") {
				throw new Error(
					`Supervisor node "${node.nodeKey}" can only route to worker nodes.`,
				);
			}
		}
		const finishTarget =
			typeof node.config.finish_target === "string"
				? node.config.finish_target
				: "";
		if (finishTarget) {
			const finishTargetNode = nodeByKey.get(finishTarget);
			if (!finishTargetNode) {
				throw new Error(
					`Supervisor node "${node.nodeKey}" references missing finish_target "${finishTarget}".`,
				);
			}
		}
	}

	const normalizedEdges = input.edges.map((edge) => {
		const fromNode = edge.fromNode.trim();
		const toNode = edge.toNode.trim();
		if (!NODE_KEY_PATTERN.test(fromNode)) {
			throw new Error(`Edge fromNode "${fromNode}" is invalid.`);
		}
		if (toNode !== "END" && !NODE_KEY_PATTERN.test(toNode)) {
			throw new Error(`Edge toNode "${toNode}" is invalid.`);
		}
		if (!nodeByKey.has(fromNode)) {
			throw new Error(`Edge references missing fromNode "${fromNode}".`);
		}
		if (toNode !== "END" && !nodeByKey.has(toNode)) {
			throw new Error(`Edge references missing toNode "${toNode}".`);
		}
		return { fromNode, toNode };
	});

	const seenEdgeKeys = new Set<string>();
	for (const edge of normalizedEdges) {
		const key = `${edge.fromNode}->${edge.toNode}`;
		if (seenEdgeKeys.has(key)) {
			throw new Error(`Duplicate edge "${key}" is not allowed.`);
		}
		seenEdgeKeys.add(key);
	}

	for (const node of normalizedNodes) {
		if (node.nodeType !== "condition") {
			continue;
		}
		const trueTarget = String(node.config.true_target);
		const falseTarget = String(node.config.false_target);
		const outgoingTargets = normalizedEdges
			.filter((edge) => edge.fromNode === node.nodeKey)
			.map((edge) => edge.toNode);
		for (const target of [trueTarget, falseTarget]) {
			if (!outgoingTargets.includes(target)) {
				throw new Error(
					`Condition node "${node.nodeKey}" must include an edge to "${target}".`,
				);
			}
		}
	}

	const adjacency = new Map<string, string[]>();
	for (const node of normalizedNodes) {
		adjacency.set(node.nodeKey, []);
	}
	for (const edge of normalizedEdges) {
		appendAdjacency(adjacency, edge.fromNode, edge.toNode);
	}

	const supervisorMemberKeys = new Set<string>();
	for (const node of normalizedNodes) {
		if (node.nodeType !== "supervisor") {
			continue;
		}
		const members = Array.isArray(node.config.members)
			? (node.config.members as string[])
			: [];
		for (const member of members) {
			supervisorMemberKeys.add(member);
			appendAdjacency(adjacency, node.nodeKey, member);
		}
		const finishTarget =
			typeof node.config.finish_target === "string"
				? node.config.finish_target
				: "";
		appendAdjacency(adjacency, node.nodeKey, finishTarget || "END");
	}

	const reachable = new Set<string>();
	const queue = [input.entryNode];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || reachable.has(current)) {
			continue;
		}
		reachable.add(current);
		for (const next of adjacency.get(current) ?? []) {
			if (next !== "END") {
				queue.push(next);
			}
		}
	}

	if (reachable.size !== normalizedNodes.length) {
		const unreachable = normalizedNodes
			.map((node) => node.nodeKey)
			.filter((nodeKey) => !reachable.has(nodeKey));
		throw new Error(
			`Every node must be reachable from the entry node. Unreachable: ${unreachable.join(", ")}`,
		);
	}

	const reachesEnd = new Set<string>(["END"]);
	let progress = true;
	while (progress) {
		progress = false;
		for (const node of normalizedNodes) {
			if (reachesEnd.has(node.nodeKey)) {
				continue;
			}
			const outgoingTargets = adjacency.get(node.nodeKey) ?? [];
			if (
				outgoingTargets.length === 0 &&
				supervisorMemberKeys.has(node.nodeKey)
			) {
				reachesEnd.add(node.nodeKey);
				progress = true;
				continue;
			}
			if (outgoingTargets.some((target) => reachesEnd.has(target))) {
				reachesEnd.add(node.nodeKey);
				progress = true;
			}
		}
	}

	if (!reachesEnd.has(input.entryNode)) {
		throw new Error("The entry node must have a path to END.");
	}

	return {
		nodes: normalizedNodes,
		edges: normalizedEdges,
	};
}
