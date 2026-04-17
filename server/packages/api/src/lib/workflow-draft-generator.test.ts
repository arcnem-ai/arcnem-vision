import { describe, expect, test } from "bun:test";
import type {
	WorkflowModelOption,
	WorkflowToolOption,
} from "@arcnem-vision/shared";
import {
	getCompatibleWorkerModels,
	materializeGeneratedWorkflowDraft,
} from "./workflow-draft-generator";
import { generatedWorkflowPlanSchema } from "./workflow-draft-generator/schema";

const modelCatalog: WorkflowModelOption[] = [
	{
		id: "model-chat",
		provider: "OPENAI",
		name: "gpt-4.1-mini",
		type: "chat",
		label: "OPENAI / gpt-4.1-mini",
	},
	{
		id: "model-ocr",
		provider: "REPLICATE",
		name: "mind-ware/dots-ocr-with-confidence",
		type: "ocr",
		label: "REPLICATE / mind-ware/dots-ocr-with-confidence",
	},
];

const executionModelCatalog = [
	{
		provider: "OPENAI",
		name: "gpt-4.1-mini",
		version: "",
		type: "chat",
	},
	{
		provider: "REPLICATE",
		name: "lucataco/deepseek-ocr",
		version: "cb3b474fbfc56b1664c8c7841550bccecbe7b74c30e45ce938ffca1180b4dff5",
		type: "ocr",
	},
	{
		provider: "REPLICATE",
		name: "mind-ware/dots-ocr-with-confidence",
		version: "91ce60f4885d7ca6e095755e25d0f9ff2bcfe963c816937ece4be50d811f26c4",
		type: "ocr",
	},
	{
		provider: "REPLICATE",
		name: "tmappdev/lang-segment-anything",
		version: "891411c38a6ed2d44c004b7b9e44217df7a5b07848f29ddefd2e28bc7cbf93bc",
		type: "segmentation",
	},
] as const;

const toolCatalog: WorkflowToolOption[] = [
	{
		id: "tool-ocr",
		name: "create_document_ocr",
		description: "Extract OCR text.",
		inputSchema: {
			required: [
				"document_id",
				"temp_url",
				"model_provider",
				"model_name",
				"model_version",
			],
		},
		outputSchema: {},
		inputFields: [
			"document_id",
			"temp_url",
			"model_provider",
			"model_name",
			"model_version",
			"input_params",
		],
		outputFields: ["ocr_result_id", "text", "avg_confidence", "result"],
	},
	{
		id: "tool-desc",
		name: "create_document_description",
		description: "Save a generated description.",
		inputSchema: {
			required: [
				"document_id",
				"text",
				"model_provider",
				"model_name",
				"model_version",
			],
		},
		outputSchema: {},
		inputFields: [
			"document_id",
			"text",
			"model_provider",
			"model_name",
			"model_version",
		],
		outputFields: ["description_id", "text"],
	},
	{
		id: "tool-seg",
		name: "create_document_segmentation",
		description: "Run document segmentation.",
		inputSchema: {
			required: [
				"document_id",
				"temp_url",
				"model_provider",
				"model_name",
				"model_version",
			],
		},
		outputSchema: {},
		inputFields: [
			"document_id",
			"temp_url",
			"model_provider",
			"model_name",
			"model_version",
			"input_params",
		],
		outputFields: [
			"segmentation_id",
			"segmented_document_id",
			"segmented_temp_url",
			"result",
		],
	},
];

describe("workflow draft generator helpers", () => {
	function parseGeneratedPlan(value: unknown) {
		return generatedWorkflowPlanSchema.parse(value);
	}

	test("keeps only OpenAI chat models for worker selection", () => {
		expect(getCompatibleWorkerModels(modelCatalog)).toEqual([modelCatalog[0]]);
	});

	test("resolves model labels and tool names to live catalog ids", () => {
		const draft = materializeGeneratedWorkflowDraft({
			generated: parseGeneratedPlan({
				name: "Document Description Pipeline",
				description: "Describe a document and save the summary.",
				entryNode: "describe_document",
				nodes: [
					{
						nodeKey: "describe_document",
						nodeType: "worker",
						inputKey: "temp_url",
						outputKey: "description",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Describe the image.",
						maxIterations: 3,
						inputMode: "image_url",
						inputPrompt: "Describe this document image.",
					},
					{
						nodeKey: "save_description",
						nodeType: "tool",
						inputKey: "",
						outputKey: "",
						tools: ["create_document_description"],
						inputMappingEntries: [
							{ field: "text", value: "description" },
							{ field: "model_provider", value: "_const:OPENAI" },
							{ field: "model_name", value: "_const:gpt-4.1-mini" },
							{ field: "model_version", value: "_const:" },
						],
						inputParamEntries: [],
						outputMappingEntries: [],
					},
				],
				edges: [
					{ fromNode: "describe_document", toNode: "save_description" },
					{ fromNode: "save_description", toNode: "END" },
				],
			}),
			modelCatalog,
			toolCatalog,
			executionModelCatalog: [...executionModelCatalog],
		});

		expect(draft.nodes[0]?.modelId).toBe("model-chat");
		expect(draft.nodes[1]?.toolIds).toEqual(["tool-desc"]);
		expect(draft.nodes[0]?.x).toBeLessThan(draft.nodes[1]?.x ?? 0);
	});

	test("fails clearly when a requested tool is unavailable", () => {
		expect(() =>
			materializeGeneratedWorkflowDraft({
				generated: parseGeneratedPlan({
					name: "Email Workflow",
					description: "Try to email a summary.",
					entryNode: "send_email",
					nodes: [
						{
							nodeKey: "send_email",
							nodeType: "tool",
							inputKey: "",
							outputKey: "",
							tools: ["send_email"],
							inputMappingEntries: [],
							inputParamEntries: [],
							outputMappingEntries: [],
						},
					],
					edges: [{ fromNode: "send_email", toNode: "END" }],
				}),
				modelCatalog,
				toolCatalog,
				executionModelCatalog: [...executionModelCatalog],
			}),
		).toThrow(/unknown tool/i);
	});

	test("accepts a generated condition router", () => {
		const draft = materializeGeneratedWorkflowDraft({
			generated: parseGeneratedPlan({
				name: "OCR Keyword Router",
				description: "Extract OCR text and branch on URGENT.",
				entryNode: "extract_ocr",
				nodes: [
					{
						nodeKey: "extract_ocr",
						nodeType: "tool",
						inputKey: "",
						outputKey: "",
						tools: ["create_document_ocr"],
						inputMappingEntries: [
							{ field: "model_provider", value: "_const:REPLICATE" },
							{
								field: "model_name",
								value: "_const:lucataco/deepseek-ocr",
							},
							{
								field: "model_version",
								value:
									"_const:cb3b474fbfc56b1664c8c7841550bccecbe7b74c30e45ce938ffca1180b4dff5",
							},
						],
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
						inputKey: "",
						outputKey: "contains_urgent",
						tools: [],
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
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Handle urgent notices.",
						maxIterations: 3,
					},
					{
						nodeKey: "general_worker",
						nodeType: "worker",
						inputKey: "ocr_text",
						outputKey: "summary",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Handle routine notices.",
						maxIterations: 3,
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
			modelCatalog,
			toolCatalog,
			executionModelCatalog: [...executionModelCatalog],
		});

		expect(draft.entryNode).toBe("extract_ocr");
		expect(draft.nodes).toHaveLength(4);
	});

	test("accepts a generated supervisor graph with finish_target", () => {
		const draft = materializeGeneratedWorkflowDraft({
			generated: parseGeneratedPlan({
				name: "OCR Review Supervisor",
				description: "Route OCR text to one specialist, then save it.",
				entryNode: "ocr_review_supervisor",
				nodes: [
					{
						nodeKey: "ocr_review_supervisor",
						nodeType: "supervisor",
						inputKey: "ocr_text",
						outputKey: "ocr_review_summary",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						members: ["billing_worker", "operations_worker"],
						inputPrompt: "Route this OCR text to exactly one specialist.",
						maxIterations: 6,
						finishTarget: "save_review_summary",
					},
					{
						nodeKey: "billing_worker",
						nodeType: "worker",
						inputKey: "",
						outputKey: "",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Handle billing OCR text.",
						maxIterations: 3,
					},
					{
						nodeKey: "operations_worker",
						nodeType: "worker",
						inputKey: "",
						outputKey: "",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Handle operations OCR text.",
						maxIterations: 3,
					},
					{
						nodeKey: "save_review_summary",
						nodeType: "tool",
						inputKey: "",
						outputKey: "",
						tools: ["create_document_description"],
						inputMappingEntries: [
							{ field: "text", value: "ocr_review_summary" },
							{ field: "model_provider", value: "_const:OPENAI" },
							{ field: "model_name", value: "_const:gpt-4.1-mini" },
							{ field: "model_version", value: "_const:" },
						],
						inputParamEntries: [],
						outputMappingEntries: [],
					},
				],
				edges: [
					{
						fromNode: "ocr_review_supervisor",
						toNode: "save_review_summary",
					},
					{ fromNode: "save_review_summary", toNode: "END" },
				],
			}),
			modelCatalog,
			toolCatalog,
			executionModelCatalog: [...executionModelCatalog],
		});

		expect(
			draft.nodes.find((node) => node.nodeKey === "ocr_review_supervisor"),
		).toBeDefined();
	});

	test("adds the missing explicit edge for a supervisor finish_target", () => {
		const draft = materializeGeneratedWorkflowDraft({
			generated: parseGeneratedPlan({
				name: "OCR Review Supervisor",
				description: "Route OCR text to one specialist, then save it.",
				entryNode: "ocr_review_supervisor",
				nodes: [
					{
						nodeKey: "ocr_review_supervisor",
						nodeType: "supervisor",
						inputKey: "ocr_text",
						outputKey: "ocr_review_summary",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						members: ["billing_worker", "operations_worker"],
						inputPrompt: "Route this OCR text to exactly one specialist.",
						maxIterations: 6,
						finishTarget: "save_review_summary",
					},
					{
						nodeKey: "billing_worker",
						nodeType: "worker",
						inputKey: "",
						outputKey: "",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Handle billing OCR text.",
						maxIterations: 3,
					},
					{
						nodeKey: "operations_worker",
						nodeType: "worker",
						inputKey: "",
						outputKey: "",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Handle operations OCR text.",
						maxIterations: 3,
					},
					{
						nodeKey: "save_review_summary",
						nodeType: "tool",
						inputKey: "",
						outputKey: "",
						tools: ["create_document_description"],
						inputMappingEntries: [
							{ field: "text", value: "ocr_review_summary" },
							{ field: "model_provider", value: "_const:OPENAI" },
							{ field: "model_name", value: "_const:gpt-4.1-mini" },
							{ field: "model_version", value: "_const:" },
						],
						inputParamEntries: [],
						outputMappingEntries: [],
					},
				],
				edges: [{ fromNode: "save_review_summary", toNode: "END" }],
			}),
			modelCatalog,
			toolCatalog,
			executionModelCatalog: [...executionModelCatalog],
		});

		expect(draft.edges).toContainEqual({
			fromNode: "ocr_review_supervisor",
			toNode: "save_review_summary",
		});
	});

	test("accepts a generated supervisor graph that finishes directly to END", () => {
		const draft = materializeGeneratedWorkflowDraft({
			generated: parseGeneratedPlan({
				name: "Image Quality Review",
				description: "Route an image to the correct specialist and finish.",
				entryNode: "quality_review_supervisor",
				nodes: [
					{
						nodeKey: "quality_review_supervisor",
						nodeType: "supervisor",
						inputKey: "temp_url",
						outputKey: "quality_review",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						members: ["good_worker", "bad_worker"],
						inputMode: "image_url",
						inputPrompt: "Route this image to exactly one quality specialist.",
						maxIterations: 6,
					},
					{
						nodeKey: "good_worker",
						nodeType: "worker",
						inputKey: "",
						outputKey: "",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Explain why the image is good.",
						maxIterations: 3,
					},
					{
						nodeKey: "bad_worker",
						nodeType: "worker",
						inputKey: "",
						outputKey: "",
						model: "OPENAI / gpt-4.1-mini",
						tools: [],
						systemMessage: "Explain why the image is bad.",
						maxIterations: 3,
					},
				],
				edges: [],
			}),
			modelCatalog,
			toolCatalog,
			executionModelCatalog: [...executionModelCatalog],
		});

		expect(draft.nodes).toHaveLength(3);
	});

	test("rejects generated condition routers that branch to the same target", () => {
		expect(() =>
			materializeGeneratedWorkflowDraft({
				generated: parseGeneratedPlan({
					name: "Broken Router",
					description: "This should fail before opening in the editor.",
					entryNode: "route_keyword",
					nodes: [
						{
							nodeKey: "route_keyword",
							nodeType: "condition",
							inputKey: "",
							outputKey: "",
							tools: [],
							sourceKey: "ocr_text",
							operator: "contains",
							value: "invoice",
							caseSensitive: false,
							trueTarget: "billing_worker",
							falseTarget: "billing_worker",
						},
						{
							nodeKey: "billing_worker",
							nodeType: "worker",
							inputKey: "ocr_text",
							outputKey: "summary",
							model: "OPENAI / gpt-4.1-mini",
							tools: [],
							systemMessage: "Handle billing OCR text.",
							maxIterations: 3,
						},
					],
					edges: [
						{ fromNode: "route_keyword", toNode: "billing_worker" },
						{ fromNode: "billing_worker", toNode: "END" },
					],
				}),
				modelCatalog,
				toolCatalog,
				executionModelCatalog: [...executionModelCatalog],
			}),
		).toThrow(/two different targets/i);
	});

	test("rejects top-level tool inputs nested inside input_params", () => {
		expect(() =>
			materializeGeneratedWorkflowDraft({
				generated: parseGeneratedPlan({
					name: "Broken OCR Tool",
					description: "This should fail before opening in the editor.",
					entryNode: "extract_ocr",
					nodes: [
						{
							nodeKey: "extract_ocr",
							nodeType: "tool",
							inputKey: "",
							outputKey: "",
							tools: ["create_document_ocr"],
							inputMappingEntries: [{ field: "temp_url", value: "temp_url" }],
							inputParamEntries: [
								{
									field: "model_provider",
									valueKind: "string",
									value: "REPLICATE",
								},
								{
									field: "model_name",
									valueKind: "string",
									value: "mind-ware/dots-ocr-with-confidence",
								},
								{
									field: "model_version",
									valueKind: "string",
									value: "",
								},
							],
							outputMappingEntries: [
								{ field: "text", value: "ocr_text" },
								{ field: "ocr_result_id", value: "ocr_result_id" },
							],
						},
					],
					edges: [{ fromNode: "extract_ocr", toNode: "END" }],
				}),
				modelCatalog,
				toolCatalog,
				executionModelCatalog: [...executionModelCatalog],
			}),
		).toThrow(/inputMappingEntries, not inputParamEntries/i);
	});

	test("rejects unknown execution model triples before runtime", () => {
		expect(() =>
			materializeGeneratedWorkflowDraft({
				generated: parseGeneratedPlan({
					name: "Broken OCR Version",
					description: "This should fail before runtime.",
					entryNode: "extract_ocr",
					nodes: [
						{
							nodeKey: "extract_ocr",
							nodeType: "tool",
							inputKey: "",
							outputKey: "",
							tools: ["create_document_ocr"],
							inputMappingEntries: [
								{ field: "model_provider", value: "_const:REPLICATE" },
								{
									field: "model_name",
									value: "_const:lucataco/deepseek-ocr",
								},
								{ field: "model_version", value: "_const:" },
							],
							inputParamEntries: [],
							outputMappingEntries: [
								{ field: "text", value: "ocr_text" },
								{ field: "ocr_result_id", value: "ocr_result_id" },
							],
						},
					],
					edges: [{ fromNode: "extract_ocr", toNode: "END" }],
				}),
				modelCatalog,
				toolCatalog,
				executionModelCatalog: [...executionModelCatalog],
			}),
		).toThrow(/unknown execution model/i);
	});

	test("rejects save tools that read from a supervisor member output key", () => {
		expect(() =>
			materializeGeneratedWorkflowDraft({
				generated: parseGeneratedPlan({
					name: "Broken Supervisor Save",
					description: "This should fail before runtime.",
					entryNode: "ocr_review_supervisor",
					nodes: [
						{
							nodeKey: "ocr_review_supervisor",
							nodeType: "supervisor",
							inputKey: "ocr_text",
							outputKey: "ocr_review_summary",
							model: "OPENAI / gpt-4.1-mini",
							tools: [],
							members: ["billing_worker", "operations_worker"],
							maxIterations: 2,
							finishTarget: "save_summary",
						},
						{
							nodeKey: "billing_worker",
							nodeType: "worker",
							inputKey: "",
							outputKey: "summary",
							model: "OPENAI / gpt-4.1-mini",
							tools: [],
							systemMessage: "Handle billing OCR text.",
							maxIterations: 2,
						},
						{
							nodeKey: "operations_worker",
							nodeType: "worker",
							inputKey: "",
							outputKey: "summary",
							model: "OPENAI / gpt-4.1-mini",
							tools: [],
							systemMessage: "Handle operations OCR text.",
							maxIterations: 2,
						},
						{
							nodeKey: "save_summary",
							nodeType: "tool",
							inputKey: "",
							outputKey: "",
							tools: ["create_document_description"],
							inputMappingEntries: [
								{ field: "text", value: "summary" },
								{ field: "model_provider", value: "_const:OPENAI" },
								{ field: "model_name", value: "_const:gpt-4.1-mini" },
								{ field: "model_version", value: "_const:" },
							],
							inputParamEntries: [],
							outputMappingEntries: [],
						},
					],
					edges: [
						{ fromNode: "ocr_review_supervisor", toNode: "save_summary" },
						{ fromNode: "save_summary", toNode: "END" },
					],
				}),
				modelCatalog,
				toolCatalog,
				executionModelCatalog: [...executionModelCatalog],
			}),
		).toThrow(/missing resolvable values for required inputs: text/i);
	});
});
