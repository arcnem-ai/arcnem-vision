import { describe, expect, test } from "bun:test";
import {
	buildExecutionScope,
	buildSeededInitialState,
	buildWorkflowExecutionEventData,
	mergeRequestedDocumentIds,
	parseBoolean,
	parseCSVList,
	parseServiceDocumentListQuery,
} from "./service.helpers";

describe("service route helpers", () => {
	test("parseCSVList trims items and drops empty entries", () => {
		expect(parseCSVList(" doc-1, ,doc-2 ,, doc-3 ")).toEqual([
			"doc-1",
			"doc-2",
			"doc-3",
		]);
		expect(parseCSVList(" ,, ")).toBeUndefined();
		expect(parseCSVList(undefined)).toBeUndefined();
	});

	test("parseBoolean supports explicit query values", () => {
		expect(parseBoolean("true")).toBe(true);
		expect(parseBoolean("1")).toBe(true);
		expect(parseBoolean("false")).toBe(false);
		expect(parseBoolean("0")).toBe(false);
		expect(parseBoolean("maybe")).toBeUndefined();
		expect(parseBoolean(undefined)).toBeUndefined();
	});

	test("parseServiceDocumentListQuery validates list filters", () => {
		expect(
			parseServiceDocumentListQuery({
				limit: "25",
				documentIds: "doc-1, doc-2",
				deviceBound: "false",
			}),
		).toEqual({
			ok: true,
			data: {
				limit: 25,
				documentIds: ["doc-1", "doc-2"],
				deviceBound: false,
			},
		});

		expect(
			parseServiceDocumentListQuery({
				deviceIds: "device-1",
				deviceBound: "false",
			}),
		).toEqual({
			ok: false,
			message: "deviceIds cannot be combined with deviceBound=false",
		});

		expect(
			parseServiceDocumentListQuery({
				limit: "abc",
			}),
		).toEqual({
			ok: false,
			message: "Invalid input: expected number, received NaN",
		});

		expect(
			parseServiceDocumentListQuery({
				deviceBound: "maybe",
			}),
		).toEqual({
			ok: false,
			message: "deviceBound must be true or false",
		});
	});

	test("mergeRequestedDocumentIds keeps the first occurrence order", () => {
		expect(
			mergeRequestedDocumentIds({
				documentIds: ["doc-1", "doc-2"],
				scope: {
					documentIds: ["doc-2", "doc-3", "doc-1"],
				},
			}),
		).toEqual(["doc-1", "doc-2", "doc-3"]);
	});

	test("buildExecutionScope injects resolved document ids", () => {
		expect(
			buildExecutionScope(
				{
					deviceIds: ["device-1"],
					deviceBound: true,
				},
				["doc-1", "doc-2"],
			),
		).toEqual({
			deviceIds: ["device-1"],
			deviceBound: true,
			documentIds: ["doc-1", "doc-2"],
		});
	});

	test("buildSeededInitialState preserves caller state without mutating it", () => {
		const initialState = {
			analysis_label: "smoke-test",
			nested: { confidence: "high" },
		};
		const executionScope = buildExecutionScope({ deviceBound: false }, [
			"doc-1",
		]);

		expect(
			buildSeededInitialState(initialState, "project-1", executionScope),
		).toEqual({
			analysis_label: "smoke-test",
			nested: { confidence: "high" },
			project_id: "project-1",
			scope: {
				deviceBound: false,
				documentIds: ["doc-1"],
			},
		});
		expect(initialState).toEqual({
			analysis_label: "smoke-test",
			nested: { confidence: "high" },
		});
	});

	test("buildWorkflowExecutionEventData forwards the seeded state", () => {
		const executionScope = buildExecutionScope({ deviceBound: false }, [
			"doc-1",
		]);
		const seededState = buildSeededInitialState(
			{ analysis_label: "smoke-test" },
			"project-1",
			executionScope,
		);

		expect(
			buildWorkflowExecutionEventData(
				"execution-1",
				"workflow-1",
				["doc-1"],
				executionScope,
				seededState,
			),
		).toEqual({
			execution_id: "execution-1",
			workflow_id: "workflow-1",
			document_ids: ["doc-1"],
			scope: {
				deviceBound: false,
				documentIds: ["doc-1"],
			},
			initial_state: {
				analysis_label: "smoke-test",
				project_id: "project-1",
				scope: {
					deviceBound: false,
					documentIds: ["doc-1"],
				},
			},
		});
	});
});
