import type { WorkflowModelOption } from "@arcnem-vision/shared";
import type { WorkflowExecutionModel } from "./catalog";

function pickExecutionModel(
	executionModelCatalog: WorkflowExecutionModel[],
	input: {
		type?: string;
		preferredName?: string;
		provider?: string;
	},
) {
	const matches = executionModelCatalog.filter((model) => {
		if (input.type && (model.type ?? "").trim().toLowerCase() !== input.type) {
			return false;
		}
		if (
			input.provider &&
			model.provider.trim().toUpperCase() !==
				input.provider.trim().toUpperCase()
		) {
			return false;
		}
		return true;
	});

	return (
		matches.find((model) => model.name === input.preferredName) ??
		matches[0] ??
		null
	);
}

function buildToolModelMappings(model: WorkflowExecutionModel | null) {
	if (!model) {
		return [
			{ field: "model_provider", value: "_const:OPENAI" },
			{ field: "model_name", value: "_const:gpt-4.1-mini" },
			{ field: "model_version", value: "_const:" },
		];
	}

	return [
		{ field: "model_provider", value: `_const:${model.provider}` },
		{ field: "model_name", value: `_const:${model.name}` },
		{ field: "model_version", value: `_const:${model.version}` },
	];
}

function formatExample(label: string, value: Record<string, unknown>) {
	return [label, JSON.stringify(value, null, 2)].join("\n");
}

export function buildWorkflowGenerationExamples(input: {
	workerModelCatalog: WorkflowModelOption[];
	executionModelCatalog: WorkflowExecutionModel[];
}) {
	const workerModelLabel =
		input.workerModelCatalog[0]?.label ?? "OPENAI / gpt-4.1-mini";
	const textModel = pickExecutionModel(input.executionModelCatalog, {
		provider: "OPENAI",
	});
	const primaryOCRModel = pickExecutionModel(input.executionModelCatalog, {
		type: "ocr",
		preferredName: "lucataco/deepseek-ocr",
	});
	const secondaryOCRModel = pickExecutionModel(input.executionModelCatalog, {
		type: "ocr",
		preferredName: "mind-ware/dots-ocr-with-confidence",
	});
	const segmentationModel = pickExecutionModel(input.executionModelCatalog, {
		type: "segmentation",
		preferredName: "tmappdev/lang-segment-anything",
	});

	return [
		formatExample("Example: linear worker -> tool pipeline", {
			name: "Document Description Pipeline",
			description: "Describe a document image, then save the summary.",
			entryNode: "describe_document",
			nodes: [
				{
					nodeKey: "describe_document",
					nodeType: "worker",
					inputKey: "temp_url",
					outputKey: "description",
					model: workerModelLabel,
					tools: [],
					systemMessage:
						"Describe the document clearly in one short paragraph.",
					maxIterations: 3,
					inputMode: "image_url",
					inputPrompt: "Describe this document image.",
				},
				{
					nodeKey: "save_description",
					nodeType: "tool",
					tools: ["create_document_description"],
					inputMappingEntries: [
						{ field: "text", value: "description" },
						...buildToolModelMappings(textModel),
					],
					outputMappingEntries: [
						{ field: "description_id", value: "document_description_id" },
					],
				},
			],
			edges: [
				{ fromNode: "describe_document", toNode: "save_description" },
				{ fromNode: "save_description", toNode: "END" },
			],
		}),
		formatExample("Example: OCR condition router", {
			name: "OCR Keyword Router",
			description: "Extract OCR text, branch on URGENT, then save the result.",
			entryNode: "extract_ocr",
			nodes: [
				{
					nodeKey: "extract_ocr",
					nodeType: "tool",
					tools: ["create_document_ocr"],
					inputMappingEntries: buildToolModelMappings(primaryOCRModel),
					inputParamEntries: [
						{
							field: "task_type",
							valueKind: "string",
							value: "Convert to Markdown",
						},
					],
					outputMappingEntries: [
						{ field: "ocr_result_id", value: "ocr_result_id" },
						{ field: "text", value: "ocr_text" },
						{ field: "result", value: "ocr_raw_result" },
					],
				},
				{
					nodeKey: "route_keyword",
					nodeType: "condition",
					outputKey: "contains_urgent",
					sourceKey: "ocr_text",
					operator: "contains",
					value: "URGENT",
					caseSensitive: false,
					trueTarget: "urgent_worker",
					falseTarget: "general_worker",
				},
				{
					nodeKey: "urgent_worker",
					nodeType: "worker",
					inputKey: "ocr_text",
					outputKey: "summary",
					model: workerModelLabel,
					tools: [],
					systemMessage: "Summarize the urgent notice and required action.",
					maxIterations: 3,
					inputPrompt: "Summarize the urgent OCR notice.",
				},
				{
					nodeKey: "general_worker",
					nodeType: "worker",
					inputKey: "ocr_text",
					outputKey: "summary",
					model: workerModelLabel,
					tools: [],
					systemMessage:
						"Summarize the routine notice without escalating urgency.",
					maxIterations: 3,
					inputPrompt: "Summarize the routine OCR notice.",
				},
			],
			edges: [
				{ fromNode: "extract_ocr", toNode: "route_keyword" },
				{ fromNode: "route_keyword", toNode: "urgent_worker" },
				{ fromNode: "route_keyword", toNode: "general_worker" },
				{ fromNode: "urgent_worker", toNode: "END" },
				{ fromNode: "general_worker", toNode: "END" },
			],
		}),
		formatExample("Example: OCR supervisor with finish_target", {
			name: "OCR Review Supervisor",
			description:
				"Extract OCR text, route to one specialist, then save the final summary.",
			entryNode: "extract_ocr",
			nodes: [
				{
					nodeKey: "extract_ocr",
					nodeType: "tool",
					tools: ["create_document_ocr"],
					inputMappingEntries: buildToolModelMappings(secondaryOCRModel),
					inputParamEntries: [
						{
							field: "return_confidence",
							valueKind: "boolean",
							value: "true",
						},
						{
							field: "confidence_threshold",
							valueKind: "number",
							value: "0.7",
						},
					],
					outputMappingEntries: [
						{ field: "ocr_result_id", value: "ocr_result_id" },
						{ field: "text", value: "ocr_text" },
						{ field: "avg_confidence", value: "ocr_avg_confidence" },
						{ field: "result", value: "ocr_raw_result" },
					],
				},
				{
					nodeKey: "ocr_review_supervisor",
					nodeType: "supervisor",
					inputKey: "ocr_text",
					outputKey: "ocr_review_summary",
					model: workerModelLabel,
					tools: [],
					members: ["billing_worker", "operations_worker"],
					inputPrompt:
						"Choose exactly one specialist based on the OCR text. After that specialist responds once, choose FINISH.",
					maxIterations: 2,
					finishTarget: "save_review_summary",
				},
				{
					nodeKey: "billing_worker",
					nodeType: "worker",
					model: workerModelLabel,
					tools: [],
					systemMessage:
						"Write the final billing-focused summary in one response. Do not ask follow-up questions or continue routing.",
					maxIterations: 2,
				},
				{
					nodeKey: "operations_worker",
					nodeType: "worker",
					model: workerModelLabel,
					tools: [],
					systemMessage:
						"Write the final operations-focused summary in one response. Do not ask follow-up questions or continue routing.",
					maxIterations: 2,
				},
				{
					nodeKey: "save_review_summary",
					nodeType: "tool",
					tools: ["create_document_description"],
					inputMappingEntries: [
						{ field: "text", value: "ocr_review_summary" },
						...buildToolModelMappings(textModel),
					],
				},
			],
			edges: [
				{ fromNode: "extract_ocr", toNode: "ocr_review_supervisor" },
				{ fromNode: "ocr_review_supervisor", toNode: "save_review_summary" },
				{ fromNode: "save_review_summary", toNode: "END" },
			],
		}),
		formatExample("Example: segmentation prompt -> tool -> summary", {
			name: "Segmentation Prompt Flow",
			description:
				"Generate a short segmentation prompt, run segmentation, then summarize the result.",
			entryNode: "suggest_prompt",
			nodes: [
				{
					nodeKey: "suggest_prompt",
					nodeType: "worker",
					inputKey: "temp_url",
					outputKey: "segmentation_prompt",
					model: workerModelLabel,
					tools: [],
					systemMessage:
						"Return one short noun phrase describing the best subject to segment.",
					maxIterations: 2,
					inputMode: "image_url",
					inputPrompt: "Return the single best subject to segment.",
				},
				{
					nodeKey: "run_segmentation",
					nodeType: "tool",
					tools: ["create_document_segmentation"],
					inputMappingEntries: buildToolModelMappings(segmentationModel),
					inputParamEntries: [
						{
							field: "text_prompt",
							valueKind: "state_key",
							value: "segmentation_prompt",
						},
					],
					outputMappingEntries: [
						{ field: "segmentation_id", value: "segmentation_id" },
						{ field: "segmented_document_id", value: "segmented_document_id" },
						{ field: "segmented_temp_url", value: "segmented_temp_url" },
						{ field: "result", value: "segmentation_result" },
					],
				},
				{
					nodeKey: "describe_segmentation",
					nodeType: "worker",
					inputKey: "segmented_temp_url",
					outputKey: "segmentation_summary",
					model: workerModelLabel,
					tools: [],
					systemMessage:
						"Describe what the segmented output appears to isolate.",
					maxIterations: 3,
					inputMode: "image_url",
					inputPrompt: "Describe this segmentation result.",
				},
			],
			edges: [
				{ fromNode: "suggest_prompt", toNode: "run_segmentation" },
				{ fromNode: "run_segmentation", toNode: "describe_segmentation" },
				{ fromNode: "describe_segmentation", toNode: "END" },
			],
		}),
	].join("\n\n");
}
