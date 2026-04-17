import { describe, expect, test } from "bun:test";
import { normalizeGraphData } from "./workflow-normalization";

const modelId = "019d666d-dfc2-7ec6-8796-c44cff2bbb0a";

describe("shared workflow normalization", () => {
	test("allows supervisor graphs that finish through an implicit finish_target", () => {
		const result = normalizeGraphData({
			entryNode: "ocr_review_supervisor",
			nodes: [
				{
					nodeKey: "ocr_review_supervisor",
					nodeType: "supervisor",
					x: 0,
					y: 0,
					modelId,
					config: {
						members: ["billing_worker", "operations_worker"],
						finish_target: "save_review_summary",
					},
				},
				{
					nodeKey: "billing_worker",
					nodeType: "worker",
					x: 240,
					y: 0,
					modelId,
					config: {},
				},
				{
					nodeKey: "operations_worker",
					nodeType: "worker",
					x: 240,
					y: 120,
					modelId,
					config: {},
				},
				{
					nodeKey: "save_review_summary",
					nodeType: "worker",
					x: 480,
					y: 60,
					modelId,
					config: {},
				},
			],
			edges: [{ fromNode: "save_review_summary", toNode: "END" }],
		});

		expect(result.nodes).toHaveLength(4);
	});

	test("rejects the unsupported exists operator for condition nodes", () => {
		expect(() =>
			normalizeGraphData({
				entryNode: "route_keyword",
				nodes: [
					{
						nodeKey: "route_keyword",
						nodeType: "condition",
						x: 0,
						y: 0,
						config: {
							source_key: "ocr_text",
							operator: "exists",
							value: "ignored",
							true_target: "worker_a",
							false_target: "worker_b",
						},
					},
					{
						nodeKey: "worker_a",
						nodeType: "worker",
						x: 240,
						y: 0,
						modelId,
						config: {},
					},
					{
						nodeKey: "worker_b",
						nodeType: "worker",
						x: 240,
						y: 120,
						modelId,
						config: {},
					},
				],
				edges: [
					{ fromNode: "route_keyword", toNode: "worker_a" },
					{ fromNode: "route_keyword", toNode: "worker_b" },
					{ fromNode: "worker_a", toNode: "END" },
					{ fromNode: "worker_b", toNode: "END" },
				],
			}),
		).toThrow(/equals or contains/i);
	});

	test("rejects condition nodes that branch to the same target twice", () => {
		expect(() =>
			normalizeGraphData({
				entryNode: "route_keyword",
				nodes: [
					{
						nodeKey: "route_keyword",
						nodeType: "condition",
						x: 0,
						y: 0,
						config: {
							source_key: "ocr_text",
							operator: "contains",
							value: "invoice",
							true_target: "billing_worker",
							false_target: "billing_worker",
						},
					},
					{
						nodeKey: "billing_worker",
						nodeType: "worker",
						x: 240,
						y: 0,
						modelId,
						config: {},
					},
				],
				edges: [
					{ fromNode: "route_keyword", toNode: "billing_worker" },
					{ fromNode: "billing_worker", toNode: "END" },
				],
			}),
		).toThrow(/two different targets/i);
	});
});
