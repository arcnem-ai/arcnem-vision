import type {
	WorkflowModelOption,
	WorkflowToolOption,
} from "@arcnem-vision/shared";

export type WorkflowExecutionModel = {
	provider: string;
	name: string;
	version: string;
	type: string | null;
};

export type WorkflowGenerationCatalog = {
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
	executionModelCatalog: WorkflowExecutionModel[];
};

const WORKER_MODEL_TYPE = new Set(["chat", ""]);

export function getCompatibleWorkerModels(modelCatalog: WorkflowModelOption[]) {
	return modelCatalog.filter((model) => {
		const provider = model.provider.trim().toUpperCase();
		const type = (model.type ?? "").trim().toLowerCase();
		return provider === "OPENAI" && WORKER_MODEL_TYPE.has(type);
	});
}

function normalizeLookupToken(value: string | null | undefined) {
	return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function normalizeExecutionModelToken(input: {
	provider: string | null | undefined;
	name: string | null | undefined;
	version: string | null | undefined;
}) {
	return [
		normalizeLookupToken(input.provider),
		normalizeLookupToken(input.name),
		normalizeLookupToken(input.version),
	].join("::");
}

export function buildModelLookup(modelCatalog: WorkflowModelOption[]) {
	const lookup = new Map<string, string>();

	for (const model of modelCatalog) {
		const normalizedLabel = normalizeLookupToken(model.label);
		if (normalizedLabel) {
			lookup.set(normalizedLabel, model.id);
		}
	}

	return lookup;
}

export function buildToolLookup(toolCatalog: WorkflowToolOption[]) {
	const lookup = new Map<string, string>();

	for (const tool of toolCatalog) {
		const normalizedName = normalizeLookupToken(tool.name);
		if (normalizedName) {
			lookup.set(normalizedName, tool.id);
		}
	}

	return lookup;
}

export function buildExecutionModelLookup(
	executionModelCatalog: WorkflowExecutionModel[],
) {
	const lookup = new Set<string>();

	for (const model of executionModelCatalog) {
		lookup.add(
			normalizeExecutionModelToken({
				provider: model.provider,
				name: model.name,
				version: model.version,
			}),
		);
	}

	return lookup;
}

export function resolveModelId(
	requestedModel: string | null | undefined,
	modelLookup: Map<string, string>,
) {
	const normalized = normalizeLookupToken(requestedModel);
	if (!normalized) {
		throw new Error("Worker and supervisor nodes must choose a model.");
	}

	const modelId = modelLookup.get(normalized);
	if (!modelId) {
		throw new Error(
			`Unknown model "${requestedModel}". Use one of the exact worker model labels exposed by the dashboard catalog.`,
		);
	}

	return modelId;
}

export function resolveToolIds(
	requestedTools: string[],
	toolLookup: Map<string, string>,
	nodeKey: string,
) {
	return requestedTools.map((requestedTool) => {
		const toolId = toolLookup.get(normalizeLookupToken(requestedTool));
		if (!toolId) {
			throw new Error(
				`Node "${nodeKey}" references unknown tool "${requestedTool}". Use one of the exact tool names exposed by the dashboard catalog.`,
			);
		}
		return toolId;
	});
}

export function hasExecutionModel(
	input: {
		provider: string;
		name: string;
		version: string;
	},
	executionModelLookup: Set<string>,
) {
	return executionModelLookup.has(normalizeExecutionModelToken(input));
}
