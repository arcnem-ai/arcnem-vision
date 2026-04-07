import { describe, expect, test } from "bun:test";
import { normalizeGraphData } from "./workflow-normalization";

const modelId = "019d666d-dfc2-7ec6-8796-c44cff2bbb0a";
const toolId = "019d666d-dfc7-7746-8536-1bc78967bc18";

describe("normalizeGraphData", () => {
	test("accepts a valid worker graph", () => {
		const result = normalizeGraphData({
			entryNode: "start",
			nodes: [
				{
					nodeKey: "start",
					nodeType: "worker",
					x: 120,
					y: 80,
					modelId,
					config: {
						system_message: "process the image",
						max_iterations: 3,
					},
				},
			],
			edges: [{ fromNode: "start", toNode: "END" }],
		});

		expect(result.nodes).toHaveLength(1);
		expect(result.edges).toEqual([{ fromNode: "start", toNode: "END" }]);
	});

	test("rejects duplicate supervisor members", () => {
		expect(() =>
			normalizeGraphData({
				entryNode: "supervisor",
				nodes: [
					{
						nodeKey: "supervisor",
						nodeType: "supervisor",
						x: 0,
						y: 0,
						modelId,
						config: {
							members: ["worker_a", "worker_a"],
						},
					},
					{
						nodeKey: "worker_a",
						nodeType: "worker",
						x: 120,
						y: 0,
						modelId,
						config: {},
					},
				],
				edges: [
					{ fromNode: "supervisor", toNode: "worker_a" },
					{ fromNode: "worker_a", toNode: "END" },
				],
			}),
		).toThrow(/duplicate member/i);
	});

	test("rejects graphs where entry cannot reach END", () => {
		expect(() =>
			normalizeGraphData({
				entryNode: "node_a",
				nodes: [
					{
						nodeKey: "node_a",
						nodeType: "worker",
						x: 0,
						y: 0,
						modelId,
						config: {},
					},
					{
						nodeKey: "node_b",
						nodeType: "worker",
						x: 100,
						y: 0,
						modelId,
						config: {},
					},
				],
				edges: [{ fromNode: "node_b", toNode: "END" }],
			}),
		).toThrow(/path to END/i);
	});

	test("accepts a valid condition graph", () => {
		const result = normalizeGraphData({
			entryNode: "extract_ocr",
			nodes: [
				{
					nodeKey: "extract_ocr",
					nodeType: "tool",
					x: 0,
					y: 0,
					toolIds: [toolId],
					config: {},
				},
				{
					nodeKey: "route_keyword",
					nodeType: "condition",
					x: 150,
					y: 0,
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
					nodeKey: "urgent_worker",
					nodeType: "worker",
					x: 300,
					y: 0,
					modelId,
					config: {},
				},
				{
					nodeKey: "general_worker",
					nodeType: "worker",
					x: 300,
					y: 100,
					modelId,
					config: {},
				},
			],
			edges: [
				{ fromNode: "extract_ocr", toNode: "route_keyword" },
				{ fromNode: "route_keyword", toNode: "urgent_worker" },
				{ fromNode: "route_keyword", toNode: "general_worker" },
				{ fromNode: "urgent_worker", toNode: "END" },
				{ fromNode: "general_worker", toNode: "END" },
			],
		});

		expect(result.nodes[1]?.nodeType).toBe("condition");
	});

	test("accepts document pipeline-style graphs with uuidv7 model and tool ids", () => {
		const result = normalizeGraphData({
			entryNode: "describe",
			nodes: [
				{
					nodeKey: "describe",
					nodeType: "worker",
					x: 0,
					y: 0,
					inputKey: "temp_url",
					outputKey: "description",
					modelId,
					config: {
						system_message: "describe the document",
						max_iterations: 3,
					},
				},
				{
					nodeKey: "save_description",
					nodeType: "tool",
					x: 200,
					y: 0,
					toolIds: [toolId],
					config: {
						input_mapping: {
							text: "description",
						},
						output_mapping: {
							description_id: "document_description_id",
						},
					},
				},
			],
			edges: [
				{ fromNode: "describe", toNode: "save_description" },
				{ fromNode: "save_description", toNode: "END" },
			],
		});

		expect(result.nodes[0]?.modelId).toBe(modelId);
		expect(result.nodes[1]?.toolIds).toEqual([toolId]);
	});
});
