import { describe, expect, test } from "bun:test";
import { initialDraftFromGraph } from "./shared";

describe("initialDraftFromGraph", () => {
	test("uses a generated draft seed for workflow-create mode", () => {
		const initial = initialDraftFromGraph(null, {
			name: "Generated OCR Flow",
			description: "A generated draft.",
			entryNode: "extract_ocr",
			nodes: [
				{
					nodeKey: "extract_ocr",
					nodeType: "tool",
					x: 120,
					y: 120,
					inputKey: null,
					outputKey: null,
					modelId: null,
					toolIds: ["tool-ocr"],
					config: {},
				},
				{
					nodeKey: "summarize_text",
					nodeType: "worker",
					x: 380,
					y: 120,
					inputKey: "ocr_text",
					outputKey: "summary",
					modelId: "model-chat",
					toolIds: [],
					config: { system_message: "Summarize the OCR text." },
				},
			],
			edges: [
				{ fromNode: "extract_ocr", toNode: "summarize_text" },
				{ fromNode: "summarize_text", toNode: "END" },
			],
		});

		expect(initial.name).toBe("Generated OCR Flow");
		expect(initial.entryNode).toBe("extract_ocr");
		expect(initial.nodes).toHaveLength(2);
		expect(initial.nodes[0]?.localId).toBeTruthy();
		expect(initial.nodes[0]?.toolIds).toEqual(["tool-ocr"]);
		expect(initial.edges).toEqual([
			{ fromNode: "extract_ocr", toNode: "summarize_text" },
			{ fromNode: "summarize_text", toNode: "END" },
		]);
	});
});
