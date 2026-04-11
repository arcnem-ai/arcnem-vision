import type { WorkflowNodeConfig } from "../contracts/dashboard";

export const NODE_KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;
export const STATE_KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;

export const WORKFLOW_NODE_TYPES = new Set([
	"worker",
	"supervisor",
	"condition",
	"tool",
]);

export type WorkflowNodeInput = {
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

export type WorkflowEdgeInput = {
	fromNode: string;
	toNode: string;
};

export function normalizeOptionalStateKey(
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

export function normalizeOptionalUuid(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	const normalized = value.trim();
	if (!normalized) return null;
	return normalized;
}

export function normalizeNodeConfig(config: unknown): WorkflowNodeConfig {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateToolMapping(
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
		if (mappingName === "input_mapping" && typeof value !== "string") {
			continue;
		}
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

export function normalizeConditionTarget(
	value: unknown,
	nodeKey: string,
	label: "true_target" | "false_target",
): string {
	if (typeof value !== "string") {
		throw new Error(
			`Condition node "${nodeKey}" must set ${label} as a string.`,
		);
	}
	const normalized = value.trim();
	if (!normalized) {
		throw new Error(`Condition node "${nodeKey}" must set ${label}.`);
	}
	if (normalized !== "END" && !NODE_KEY_PATTERN.test(normalized)) {
		throw new Error(
			`Condition node "${nodeKey}" has invalid ${label} "${normalized}".`,
		);
	}
	return normalized;
}

export function appendAdjacency(
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
