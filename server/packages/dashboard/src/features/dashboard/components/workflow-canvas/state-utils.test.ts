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
});
