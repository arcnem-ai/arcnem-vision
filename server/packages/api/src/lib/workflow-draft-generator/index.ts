import {
	generatedWorkflowDraftResponseSchema,
	normalizeGraphData,
	normalizeWorkflowFields,
	type WorkflowDraft,
	type WorkflowModelOption,
	type WorkflowToolOption,
} from "@arcnem-vision/shared";
import { ChatOpenAI } from "@langchain/openai";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import {
	buildExecutionModelLookup,
	buildModelLookup,
	buildToolLookup,
	getCompatibleWorkerModels,
	hasExecutionModel,
	resolveModelId,
	resolveToolIds,
	type WorkflowGenerationCatalog,
} from "./catalog";
import { computeWorkflowLayout } from "./layout";
import { buildWorkflowGenerationPrompt } from "./prompt";
import {
	type GeneratedWorkflowNode,
	type GeneratedWorkflowPlan,
	generatedWorkflowPlanSchema,
} from "./schema";

function trimOptionalString(value: string | null | undefined) {
	const trimmed = value?.trim() ?? "";
	return trimmed || null;
}

function buildMappingObject(entries: Array<{ field: string; value: string }>) {
	return Object.fromEntries(
		entries.map((entry) => [entry.field.trim(), entry.value.trim()]),
	);
}

const INITIAL_WORKFLOW_STATE_KEYS = new Set(["document_id", "temp_url"]);

function buildSupervisorMemberKeys(
	nodes: Array<{
		nodeKey: string;
		nodeType: string;
		config: Record<string, unknown>;
	}>,
) {
	const memberKeys = new Set<string>();

	for (const node of nodes) {
		if (node.nodeType !== "supervisor") continue;
		const members = Array.isArray(node.config.members)
			? node.config.members.filter(
					(member): member is string =>
						typeof member === "string" && member.trim().length > 0,
				)
			: [];
		for (const member of members) {
			memberKeys.add(member.trim());
		}
	}

	return memberKeys;
}

function getRequiredToolInputFields(tool: WorkflowToolOption) {
	const required = tool.inputSchema.required;
	if (!Array.isArray(required)) {
		return [];
	}

	return required.filter(
		(field): field is string =>
			typeof field === "string" && field.trim().length > 0,
	);
}

function parseInputParamValue(
	entry: GeneratedWorkflowNode["inputParamEntries"][number],
) {
	switch (entry.valueKind) {
		case "string":
			return `_const:${entry.value}`;
		case "number":
			return Number(entry.value);
		case "boolean":
			return entry.value.trim().toLowerCase() === "true";
		case "state_key":
			return entry.value.trim();
	}
}

function buildGeneratedNodeConfig(node: GeneratedWorkflowNode) {
	switch (node.nodeType) {
		case "worker":
			return {
				...(trimOptionalString(node.systemMessage)
					? { system_message: trimOptionalString(node.systemMessage) }
					: {}),
				...(node.maxIterations > 0
					? { max_iterations: node.maxIterations }
					: {}),
				...(node.inputMode === "image_url"
					? { input_mode: node.inputMode }
					: {}),
				...(trimOptionalString(node.inputPrompt)
					? { input_prompt: trimOptionalString(node.inputPrompt) }
					: {}),
			};
		case "supervisor":
			return {
				members: node.members.map((member) => member.trim()),
				...(node.maxIterations > 0
					? { max_iterations: node.maxIterations }
					: {}),
				...(node.inputMode === "image_url"
					? { input_mode: node.inputMode }
					: {}),
				...(trimOptionalString(node.inputPrompt)
					? { input_prompt: trimOptionalString(node.inputPrompt) }
					: {}),
				...(trimOptionalString(node.finishTarget)
					? { finish_target: trimOptionalString(node.finishTarget) }
					: {}),
			};
		case "condition":
			return {
				source_key: node.sourceKey.trim(),
				operator: node.operator,
				value: node.value,
				case_sensitive: Boolean(node.caseSensitive),
				true_target: node.trueTarget.trim(),
				false_target: node.falseTarget.trim(),
			};
		case "tool": {
			const inputMapping = buildMappingObject(node.inputMappingEntries);
			const outputMapping = buildMappingObject(node.outputMappingEntries);
			const inputParams = Object.fromEntries(
				node.inputParamEntries.map((entry) => [
					entry.field.trim(),
					parseInputParamValue(entry),
				]),
			);
			return {
				...(Object.keys(inputMapping).length > 0 ||
				Object.keys(inputParams).length > 0
					? {
							input_mapping: {
								...inputMapping,
								...(Object.keys(inputParams).length > 0
									? { input_params: inputParams }
									: {}),
							},
						}
					: {}),
				...(Object.keys(outputMapping).length > 0
					? { output_mapping: outputMapping }
					: {}),
			};
		}
	}
}

function isResolvableToolInputValue(
	value: unknown,
	knownStateKeys: Set<string>,
): boolean {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return false;
		}
		if (trimmed.startsWith("_const:")) {
			return true;
		}
		return knownStateKeys.has(trimmed);
	}

	if (Array.isArray(value)) {
		return value.every((item) =>
			isResolvableToolInputValue(item, knownStateKeys),
		);
	}

	if (value && typeof value === "object") {
		return Object.values(value).every((item) =>
			isResolvableToolInputValue(item, knownStateKeys),
		);
	}

	return value != null;
}

function buildKnownStateKeys(
	nodes: Array<{
		nodeKey: string;
		nodeType: string;
		toolIds: string[];
		outputKey: string | null;
		config: Record<string, unknown>;
	}>,
	toolCatalog: WorkflowToolOption[],
) {
	const toolById = new Map(toolCatalog.map((tool) => [tool.id, tool] as const));
	const knownStateKeys = new Set(INITIAL_WORKFLOW_STATE_KEYS);
	const supervisorMemberKeys = buildSupervisorMemberKeys(nodes);

	for (const node of nodes) {
		if (node.outputKey && !supervisorMemberKeys.has(node.nodeKey)) {
			knownStateKeys.add(node.outputKey);
		}
		if (node.nodeType !== "tool") continue;

		const tool = toolById.get(node.toolIds[0] ?? "");
		if (!tool) continue;
		const outputMapping =
			node.config.output_mapping &&
			typeof node.config.output_mapping === "object" &&
			!Array.isArray(node.config.output_mapping)
				? (node.config.output_mapping as Record<string, unknown>)
				: {};

		for (const field of tool.outputFields) {
			const mapped = outputMapping[field];
			knownStateKeys.add(
				typeof mapped === "string" && mapped.trim().length > 0
					? mapped.trim()
					: field,
			);
		}
	}

	return knownStateKeys;
}

function validateRequiredToolInputs(
	nodes: Array<{
		nodeKey: string;
		nodeType: string;
		toolIds: string[];
		outputKey: string | null;
		config: Record<string, unknown>;
	}>,
	toolCatalog: WorkflowToolOption[],
) {
	const toolById = new Map(toolCatalog.map((tool) => [tool.id, tool] as const));
	const knownStateKeys = buildKnownStateKeys(nodes, toolCatalog);

	for (const node of nodes) {
		if (node.nodeType !== "tool") continue;
		const tool = toolById.get(node.toolIds[0] ?? "");
		if (!tool) continue;

		const inputMapping =
			node.config.input_mapping &&
			typeof node.config.input_mapping === "object" &&
			!Array.isArray(node.config.input_mapping)
				? (node.config.input_mapping as Record<string, unknown>)
				: {};
		const missingFields = getRequiredToolInputFields(tool).filter((field) => {
			const mapped = inputMapping[field];
			if (mapped !== undefined) {
				return !isResolvableToolInputValue(mapped, knownStateKeys);
			}
			return !knownStateKeys.has(field);
		});
		if (missingFields.length > 0) {
			throw new Error(
				`Tool node "${node.nodeKey}" is missing resolvable values for required inputs: ${missingFields.join(", ")}.`,
			);
		}
	}
}

function validateToolInputParamShape(
	nodes: Array<{
		nodeKey: string;
		nodeType: string;
		toolIds: string[];
		config: Record<string, unknown>;
	}>,
	toolCatalog: WorkflowToolOption[],
) {
	const toolById = new Map(toolCatalog.map((tool) => [tool.id, tool] as const));

	for (const node of nodes) {
		if (node.nodeType !== "tool") continue;
		const tool = toolById.get(node.toolIds[0] ?? "");
		if (!tool) continue;

		const inputMapping =
			node.config.input_mapping &&
			typeof node.config.input_mapping === "object" &&
			!Array.isArray(node.config.input_mapping)
				? (node.config.input_mapping as Record<string, unknown>)
				: {};
		const inputParams =
			inputMapping.input_params &&
			typeof inputMapping.input_params === "object" &&
			!Array.isArray(inputMapping.input_params)
				? (inputMapping.input_params as Record<string, unknown>)
				: null;
		if (!inputParams) continue;

		if (!tool.inputFields.includes("input_params")) {
			throw new Error(
				`Tool node "${node.nodeKey}" cannot set input_params because tool "${tool.name}" does not accept them.`,
			);
		}

		const misplacedFields = Object.keys(inputParams).filter(
			(field) => tool.inputFields.includes(field) && field !== "input_params",
		);
		if (misplacedFields.length > 0) {
			throw new Error(
				`Tool node "${node.nodeKey}" must map top-level tool inputs with inputMappingEntries, not inputParamEntries: ${misplacedFields.join(", ")}.`,
			);
		}
	}
}

function readConstantInputMappingValue(
	inputMapping: Record<string, unknown>,
	field: string,
) {
	const value = inputMapping[field];
	if (typeof value !== "string") {
		return null;
	}
	if (!value.startsWith("_const:")) {
		return null;
	}
	return value.slice("_const:".length);
}

function validateToolExecutionModels(
	nodes: Array<{
		nodeKey: string;
		nodeType: string;
		toolIds: string[];
		config: Record<string, unknown>;
	}>,
	toolCatalog: WorkflowToolOption[],
	executionModelCatalog: WorkflowGenerationCatalog["executionModelCatalog"],
) {
	const toolById = new Map(toolCatalog.map((tool) => [tool.id, tool] as const));
	const executionModelLookup = buildExecutionModelLookup(executionModelCatalog);

	for (const node of nodes) {
		if (node.nodeType !== "tool") continue;
		const tool = toolById.get(node.toolIds[0] ?? "");
		if (!tool) continue;

		const requiredFields = getRequiredToolInputFields(tool);
		const needsExecutionModel = [
			"model_provider",
			"model_name",
			"model_version",
		].every((field) => requiredFields.includes(field));
		if (!needsExecutionModel) {
			continue;
		}

		const inputMapping =
			node.config.input_mapping &&
			typeof node.config.input_mapping === "object" &&
			!Array.isArray(node.config.input_mapping)
				? (node.config.input_mapping as Record<string, unknown>)
				: {};
		const provider = readConstantInputMappingValue(
			inputMapping,
			"model_provider",
		);
		const name = readConstantInputMappingValue(inputMapping, "model_name");
		const version = readConstantInputMappingValue(
			inputMapping,
			"model_version",
		);

		if (provider == null || name == null || version == null) {
			throw new Error(
				`Tool node "${node.nodeKey}" must set model_provider, model_name, and model_version as top-level constant input mappings.`,
			);
		}

		if (!hasExecutionModel({ provider, name, version }, executionModelLookup)) {
			throw new Error(
				`Tool node "${node.nodeKey}" references unknown execution model ${provider}/${name} version="${version}". Use one of the exact execution models from the dashboard catalog.`,
			);
		}
	}
}

function syncGeneratedSupervisorFinishEdges(
	nodes: Array<{
		nodeKey: string;
		nodeType: string;
		config: Record<string, unknown>;
	}>,
	edges: WorkflowDraft["edges"],
) {
	const nextEdges = [...edges];

	for (const node of nodes) {
		if (node.nodeType !== "supervisor") continue;
		const finishTarget =
			typeof node.config.finish_target === "string"
				? node.config.finish_target.trim()
				: "";
		if (!finishTarget) continue;

		const hasExplicitFinishEdge = edges.some(
			(edge) => edge.fromNode === node.nodeKey && edge.toNode === finishTarget,
		);
		if (hasExplicitFinishEdge) continue;

		nextEdges.push({
			fromNode: node.nodeKey,
			toNode: finishTarget,
		});
	}

	return nextEdges;
}

function dedupeEdges(edges: WorkflowDraft["edges"]) {
	const seen = new Set<string>();
	return edges.filter((edge) => {
		const key = `${edge.fromNode}->${edge.toNode}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

export function materializeGeneratedWorkflowDraft(input: {
	generated: GeneratedWorkflowPlan;
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
	executionModelCatalog: WorkflowGenerationCatalog["executionModelCatalog"];
}) {
	if (input.generated.impossibleReason?.trim()) {
		throw new Error(input.generated.impossibleReason.trim());
	}

	const workerModels = getCompatibleWorkerModels(input.modelCatalog);
	if (workerModels.length === 0) {
		throw new Error(
			"No compatible worker models are available for AI generation.",
		);
	}

	const modelLookup = buildModelLookup(workerModels);
	const toolLookup = buildToolLookup(input.toolCatalog);
	const nodesWithoutPositions = input.generated.nodes.map((node) => {
		return {
			nodeKey: node.nodeKey.trim(),
			nodeType: node.nodeType,
			inputKey: trimOptionalString(node.inputKey),
			outputKey: trimOptionalString(node.outputKey),
			modelId:
				node.nodeType === "worker" || node.nodeType === "supervisor"
					? resolveModelId(trimOptionalString(node.model), modelLookup)
					: null,
			toolIds: resolveToolIds(node.tools, toolLookup, node.nodeKey),
			config: buildGeneratedNodeConfig(node),
		};
	});

	const edges = dedupeEdges(
		syncGeneratedSupervisorFinishEdges(
			nodesWithoutPositions,
			input.generated.edges.map((edge) => ({
				fromNode: edge.fromNode.trim(),
				toNode: edge.toNode.trim(),
			})),
		),
	);

	validateToolInputParamShape(nodesWithoutPositions, input.toolCatalog);
	validateToolExecutionModels(
		nodesWithoutPositions,
		input.toolCatalog,
		input.executionModelCatalog,
	);
	validateRequiredToolInputs(nodesWithoutPositions, input.toolCatalog);

	const positions = computeWorkflowLayout({
		entryNode: input.generated.entryNode.trim(),
		nodes: nodesWithoutPositions.map((node) => ({
			nodeKey: node.nodeKey,
			nodeType: node.nodeType,
			config: node.config,
		})),
		edges,
	});

	const fields = normalizeWorkflowFields({
		name: input.generated.name,
		description: input.generated.description,
		entryNode: input.generated.entryNode,
	});
	const normalizedGraph = normalizeGraphData({
		entryNode: fields.entryNode,
		nodes: nodesWithoutPositions.map((node) => ({
			...node,
			x: positions.get(node.nodeKey)?.x ?? 120,
			y: positions.get(node.nodeKey)?.y ?? 120,
		})),
		edges,
	});

	const draft = {
		name: fields.name,
		description: fields.description ?? "",
		entryNode: fields.entryNode,
		nodes: normalizedGraph.nodes.map((node) => ({
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
		edges: normalizedGraph.edges,
	} satisfies WorkflowDraft;

	return generatedWorkflowDraftResponseSchema.parse({ draft }).draft;
}

export async function generateWorkflowDraftFromDescription(input: {
	workflowDescription: string;
	catalog: WorkflowGenerationCatalog;
}) {
	const workerModels = getCompatibleWorkerModels(input.catalog.modelCatalog);
	if (workerModels.length === 0) {
		throw new Error(
			"No compatible worker models are available for AI generation.",
		);
	}

	const prompt = buildWorkflowGenerationPrompt({
		workflowDescription: input.workflowDescription,
		modelCatalog: workerModels,
		toolCatalog: input.catalog.toolCatalog,
		executionModelCatalog: input.catalog.executionModelCatalog,
	});

	const model = new ChatOpenAI({
		apiKey: getAPIEnvVar(API_ENV_VAR.OPENAI_API_KEY),
		model: getAPIEnvVar(API_ENV_VAR.OPENAI_MODEL),
		temperature: 0.1,
	});
	const structuredModel = model.withStructuredOutput(
		generatedWorkflowPlanSchema,
		{
			name: "workflow_draft",
		},
	);

	const generated = await structuredModel.invoke([
		{
			role: "system",
			content:
				"You generate structured workflow drafts for the Arcnem Vision dashboard.",
		},
		{
			role: "user",
			content: prompt,
		},
	]);

	return materializeGeneratedWorkflowDraft({
		generated: generatedWorkflowPlanSchema.parse(generated),
		modelCatalog: input.catalog.modelCatalog,
		toolCatalog: input.catalog.toolCatalog,
		executionModelCatalog: input.catalog.executionModelCatalog,
	});
}

export { getCompatibleWorkerModels } from "./catalog";
