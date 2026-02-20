import { describe, expect, test } from "bun:test";
import { normalizeGraphData } from "./workflow-normalization";

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
					modelId: "00000000-0000-4000-8000-000000000001",
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
						modelId: "00000000-0000-4000-8000-000000000001",
						config: {
							members: ["worker_a", "worker_a"],
						},
					},
					{
						nodeKey: "worker_a",
						nodeType: "worker",
						x: 120,
						y: 0,
						modelId: "00000000-0000-4000-8000-000000000001",
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
						modelId: "00000000-0000-4000-8000-000000000001",
						config: {},
					},
					{
						nodeKey: "node_b",
						nodeType: "worker",
						x: 100,
						y: 0,
						modelId: "00000000-0000-4000-8000-000000000001",
						config: {},
					},
				],
				edges: [{ fromNode: "node_b", toNode: "END" }],
			}),
		).toThrow(/path to END/i);
	});
});
