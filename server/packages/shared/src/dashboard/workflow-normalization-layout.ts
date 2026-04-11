import { NODE_KEY_PATTERN } from "./workflow-normalization-shared";

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
