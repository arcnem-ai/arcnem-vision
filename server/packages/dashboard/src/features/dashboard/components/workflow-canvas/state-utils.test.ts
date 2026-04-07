import { describe, expect, test } from "bun:test";
import { validateCanvasGraph } from "./state-utils";

const baseModelCatalog = [
	{
		id: "00000000-0000-4000-8000-000000000001",
		provider: "openai",
		name: "gpt-4.1-mini",
		type: "chat",
		label: "openai / gpt-4.1-mini",
	},
];

describe("validateCanvasGraph", () => {
	test("returns null for a valid supervisor + worker graph", () => {
		const message = validateCanvasGraph({
			entryNode: "supervisor",
			nodes: [
				{
					localId: "1",
					id: "node-1",
					nodeKey: "supervisor",
					nodeType: "supervisor",
					x: 0,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: { members: ["worker_a"] },
				},
				{
					localId: "2",
					id: "node-2",
					nodeKey: "worker_a",
					nodeType: "worker",
					x: 240,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: { max_iterations: 3 },
				},
			],
			edges: [
				{ fromNode: "supervisor", toNode: "worker_a" },
				{ fromNode: "worker_a", toNode: "END" },
			],
			modelCatalog: baseModelCatalog,
			toolCatalog: [],
		});

		expect(message).toBeNull();
	});

	test("allows supervisor graphs that rely on implicit finish routing", () => {
		const message = validateCanvasGraph({
			entryNode: "quality_review_supervisor",
			nodes: [
				{
					localId: "1",
					id: "node-1",
					nodeKey: "quality_review_supervisor",
					nodeType: "supervisor",
					x: 0,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: {
						members: ["image_quality_good_worker", "image_quality_bad_worker"],
					},
				},
				{
					localId: "2",
					id: "node-2",
					nodeKey: "image_quality_good_worker",
					nodeType: "worker",
					x: 240,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: {},
				},
				{
					localId: "3",
					id: "node-3",
					nodeKey: "image_quality_bad_worker",
					nodeType: "worker",
					x: 240,
					y: 100,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: {},
				},
			],
			edges: [],
			modelCatalog: baseModelCatalog,
			toolCatalog: [],
		});

		expect(message).toBeNull();
	});

	test("rejects duplicate supervisor members", () => {
		const message = validateCanvasGraph({
			entryNode: "supervisor",
			nodes: [
				{
					localId: "1",
					id: "node-1",
					nodeKey: "supervisor",
					nodeType: "supervisor",
					x: 0,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: { members: ["worker_a", "worker_a"] },
				},
				{
					localId: "2",
					id: "node-2",
					nodeKey: "worker_a",
					nodeType: "worker",
					x: 240,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: {},
				},
			],
			edges: [
				{ fromNode: "supervisor", toNode: "worker_a" },
				{ fromNode: "worker_a", toNode: "END" },
			],
			modelCatalog: baseModelCatalog,
			toolCatalog: [],
		});

		expect(message).toMatch(/duplicate members/i);
	});

	test("validates a condition graph with managed edges", () => {
		const message = validateCanvasGraph({
			entryNode: "extract_ocr",
			nodes: [
				{
					localId: "1",
					id: "node-1",
					nodeKey: "extract_ocr",
					nodeType: "tool",
					x: 0,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: null,
					modelLabel: null,
					toolIds: ["00000000-0000-4000-8000-000000000002"],
					tools: [],
					toolNames: [],
					config: {},
				},
				{
					localId: "2",
					id: "node-2",
					nodeKey: "route_keyword",
					nodeType: "condition",
					x: 160,
					y: 0,
					inputKey: null,
					outputKey: "contains_urgent",
					modelId: null,
					modelLabel: null,
					toolIds: [],
					tools: [],
					toolNames: [],
					config: {
						source_key: "ocr_text",
						operator: "contains",
						value: "URGENT",
						case_sensitive: false,
						true_target: "urgent_worker",
						false_target: "general_worker",
					},
				},
				{
					localId: "3",
					id: "node-3",
					nodeKey: "urgent_worker",
					nodeType: "worker",
					x: 320,
					y: 0,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: { max_iterations: 3 },
				},
				{
					localId: "4",
					id: "node-4",
					nodeKey: "general_worker",
					nodeType: "worker",
					x: 320,
					y: 100,
					inputKey: null,
					outputKey: null,
					modelId: "00000000-0000-4000-8000-000000000001",
					modelLabel: "openai / gpt-4.1-mini",
					toolIds: [],
					tools: [],
					toolNames: [],
					config: { max_iterations: 3 },
				},
			],
			edges: [
				{ fromNode: "extract_ocr", toNode: "route_keyword" },
				{ fromNode: "route_keyword", toNode: "urgent_worker" },
				{ fromNode: "route_keyword", toNode: "general_worker" },
				{ fromNode: "urgent_worker", toNode: "END" },
				{ fromNode: "general_worker", toNode: "END" },
			],
			modelCatalog: baseModelCatalog,
			toolCatalog: [
				{
					id: "00000000-0000-4000-8000-000000000002",
					name: "create_document_ocr",
					description: "OCR",
					inputSchema: {},
					outputSchema: {},
					inputFields: [],
					outputFields: [],
				},
			],
		});

		expect(message).toBeNull();
	});
});
