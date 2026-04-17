import type {
	WorkflowModelOption,
	WorkflowToolOption,
} from "@arcnem-vision/shared";
import type { WorkflowExecutionModel } from "./catalog";
import { buildWorkflowGenerationExamples } from "./examples";

function formatModelCatalog(modelCatalog: WorkflowModelOption[]) {
	return modelCatalog.map((model) => `- ${model.label}`).join("\n");
}

function formatToolCatalog(toolCatalog: WorkflowToolOption[]) {
	if (toolCatalog.length === 0) {
		return "- No tools are currently available.";
	}

	return toolCatalog
		.map((tool) => {
			const inputFields =
				tool.inputFields.length > 0 ? tool.inputFields.join(", ") : "(none)";
			const requiredFields = Array.isArray(tool.inputSchema.required)
				? tool.inputSchema.required
						.filter(
							(field): field is string =>
								typeof field === "string" && field.trim().length > 0,
						)
						.join(", ") || "(none)"
				: "(none)";
			const outputFields =
				tool.outputFields.length > 0 ? tool.outputFields.join(", ") : "(none)";
			return `- ${tool.name}: ${tool.description} | inputs: ${inputFields} | required: ${requiredFields} | outputs: ${outputFields}`;
		})
		.join("\n");
}

function formatExecutionModelCatalog(
	executionModelCatalog: WorkflowExecutionModel[],
) {
	if (executionModelCatalog.length === 0) {
		return "- No execution models are currently available.";
	}

	return executionModelCatalog
		.map((model) => {
			const type = (model.type ?? "").trim() || "unspecified";
			return `- ${model.provider} / ${model.name} | version: ${model.version || "(empty string)"} | type: ${type}`;
		})
		.join("\n");
}

export function buildWorkflowGenerationPrompt(input: {
	workflowDescription: string;
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
	executionModelCatalog: WorkflowExecutionModel[];
}) {
	return [
		"You generate Arcnem Vision workflow drafts for the dashboard canvas.",
		"Return exactly one graph that can be saved without manual repair, or set impossibleReason when the request cannot be satisfied with the available catalog.",
		"Use only these node types: worker, supervisor, condition, tool.",
		"Workers and supervisors must choose a model from the worker model catalog exactly.",
		"Tool nodes must reference exactly one tool name from the tool catalog exactly.",
		"Worker nodes may list zero or more tool names when the agent should reason with tools directly.",
		"Condition nodes must use operator contains or equals only.",
		"Condition nodes must branch to two different targets.",
		"Prefer condition nodes for deterministic branching. Use supervisors only when an LLM must choose the specialist.",
		"A supervisor creates a routing loop: supervisor -> member worker -> supervisor. Only use that loop when it is genuinely needed.",
		"If a supervisor is only choosing one specialist and then ending, treat it as a one-shot router: choose exactly one member, let that member respond once, then FINISH.",
		"For one-shot supervisors, use maxIterations 2 or 3 unless the user explicitly needs multi-step coordination.",
		"Supervisor nodes must list worker members in the top-level members field.",
		"If a supervisor uses finishTarget, include an explicit edge from the supervisor to that finish target node.",
		"Supervisor member workers should be conclusive single-pass specialists. They should return a final answer immediately, not ask follow-up questions, not hand off, and not continue deliberating.",
		"Supervisor member workers do not write durable workflow state through their outputKey. In supervisor flows, any downstream node after FINISH should read from the supervisor outputKey or a tool output, not from a member worker outputKey.",
		"Condition nodes must include explicit edges to both trueTarget and falseTarget.",
		"Tool nodes must use inputMappingEntries, inputParamEntries, and outputMappingEntries instead of nested mapping objects.",
		"inputMappingEntries map top-level tool inputs such as document_id, temp_url, text, model_provider, model_name, and model_version.",
		"inputParamEntries populate only the nested input_params object for a tool. Never use inputParamEntries for top-level tool inputs such as model_provider, model_name, or model_version.",
		"For inputParamEntries, set valueKind to string, number, boolean, or state_key. Use state_key when the tool should read from workflow state.",
		"When a tool needs model_provider, model_name, and model_version, choose one exact triple from the execution model catalog below.",
		"If an execution model catalog entry shows version: (empty string), emit model_version as _const: with nothing after the colon.",
		"Every required tool input must be satisfiable either from a known workflow state key or from an explicit mapping entry. Do not leave required tool inputs unresolved.",
		"Use inputMode image_url only when a worker or supervisor reads an image URL state key such as temp_url or segmented_temp_url.",
		"Common initial state keys available to workflows include document_id and temp_url.",
		"Do not invent tools, models, node types, or state keys unless a state key is clearly produced by a prior node or is a common initial key.",
		"Keep graphs small and direct. Prefer one clean path over elaborate branching.",
		"",
		"Available worker models:",
		formatModelCatalog(input.modelCatalog),
		"",
		"Available tools:",
		formatToolCatalog(input.toolCatalog),
		"",
		"Available execution models for tool inputs:",
		formatExecutionModelCatalog(input.executionModelCatalog),
		"",
		buildWorkflowGenerationExamples({
			workerModelCatalog: input.modelCatalog,
			executionModelCatalog: input.executionModelCatalog,
		}),
		"",
		"User request:",
		input.workflowDescription.trim(),
	].join("\n");
}
