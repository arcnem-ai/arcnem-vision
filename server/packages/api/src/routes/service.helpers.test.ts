import { describe, expect, test } from "bun:test";
import {
	buildExecutionScope,
	buildSeededInitialState,
	buildServiceDocumentSearchScope,
	buildWorkflowExecutionEventData,
	buildWorkflowExecutionSnapshot,
	createServiceIdempotencyRequestHash,
	createWorkflowExecutionSnapshotHash,
	mergeRequestedDocumentIds,
	parseBoolean,
	parseCSVList,
	parseServiceDocumentListQuery,
} from "./service.helpers";

describe("service route helpers", () => {
	test("hashes equivalent JSON objects identically", () => {
		expect(
			createServiceIdempotencyRequestHash({
				initialState: { label: "tea", nested: { b: 2, a: 1 } },
				documentIds: ["document-1", "document-2"],
			}),
		).toBe(
			createServiceIdempotencyRequestHash({
				documentIds: ["document-1", "document-2"],
				initialState: { nested: { a: 1, b: 2 }, label: "tea" },
			}),
		);
		expect(
			createServiceIdempotencyRequestHash({ documentIds: ["other"] }),
		).not.toBe(
			createServiceIdempotencyRequestHash({ documentIds: ["document-1"] }),
		);
	});

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
				apiKeyBound: "false",
			}),
		).toEqual({
			ok: true,
			data: {
				limit: 25,
				documentIds: ["doc-1", "doc-2"],
				apiKeyBound: false,
			},
		});

		expect(
			parseServiceDocumentListQuery({
				apiKeyIds: "key-1",
				apiKeyBound: "false",
			}),
		).toEqual({
			ok: false,
			message: "apiKeyIds cannot be combined with apiKeyBound=false",
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
				apiKeyBound: "maybe",
			}),
		).toEqual({
			ok: false,
			message: "apiKeyBound must be true or false",
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
					apiKeyIds: ["key-1"],
					apiKeyBound: true,
				},
				["doc-1", "doc-2"],
			),
		).toEqual({
			apiKeyIds: ["key-1"],
			apiKeyBound: true,
			documentIds: ["doc-1", "doc-2"],
		});
	});

	test("buildServiceDocumentSearchScope derives scope from the service key", () => {
		expect(
			buildServiceDocumentSearchScope(
				{ organizationId: "org-1", projectId: "project-1" },
				["doc-2", "doc-1"],
			),
		).toEqual({
			organization_id: "org-1",
			project_ids: ["project-1"],
			document_ids: ["doc-2", "doc-1"],
		});
	});

	test("buildSeededInitialState preserves caller state without mutating it", () => {
		const initialState = {
			analysis_label: "smoke-test",
			nested: { confidence: "high" },
		};
		const executionScope = buildExecutionScope({ apiKeyBound: false }, [
			"doc-1",
		]);

		expect(
			buildSeededInitialState(initialState, "project-1", executionScope),
		).toEqual({
			analysis_label: "smoke-test",
			nested: { confidence: "high" },
			project_id: "project-1",
			scope: {
				apiKeyBound: false,
				documentIds: ["doc-1"],
			},
		});
		expect(initialState).toEqual({
			analysis_label: "smoke-test",
			nested: { confidence: "high" },
		});
	});

	test("buildWorkflowExecutionEventData forwards the seeded state", () => {
		const executionScope = buildExecutionScope({ apiKeyBound: false }, [
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
				"org-1",
				["doc-1"],
				executionScope,
				seededState,
			),
		).toEqual({
			execution_id: "execution-1",
			workflow_id: "workflow-1",
			organization_id: "org-1",
			document_ids: ["doc-1"],
			scope: {
				apiKeyBound: false,
				documentIds: ["doc-1"],
			},
			initial_state: {
				analysis_label: "smoke-test",
				project_id: "project-1",
				scope: {
					apiKeyBound: false,
					documentIds: ["doc-1"],
				},
			},
		});
	});

	test("pins a complete deterministic workflow snapshot", () => {
		const workflow = {
			id: "workflow-1",
			name: "Inspection",
			description: "Inspect a document",
			entryNode: "inspect",
			stateSchema: { type: "object" },
			agentGraphTemplateId: "template-1",
			agentGraphTemplateVersionId: "version-1",
			organizationId: "org-1",
			agentGraphNodes: [
				{
					id: "node-1",
					nodeKey: "inspect",
					nodeType: "worker",
					inputKey: "document",
					outputKey: "finding",
					config: { max_iterations: 2, system_message: "Inspect it." },
					agentGraphId: "workflow-1",
					modelId: "model-1",
					models: {
						id: "model-1",
						provider: "openai",
						name: "gpt-5.6-luna",
						type: "chat",
						embeddingDim: null,
						version: "2026-08-01",
						inputSchema: null,
						outputSchema: { type: "object" },
						config: { temperature: 0 },
					},
					agentGraphNodeTools: [
						{
							tools: {
								id: "tool-1",
								name: "ocr",
								description: "Read text",
								inputSchema: { type: "object" },
								outputSchema: { type: "string" },
							},
						},
					],
				},
			],
			agentGraphEdges: [
				{
					id: "edge-1",
					fromNode: "inspect",
					toNode: "END",
					agentGraphId: "workflow-1",
				},
			],
		};

		const snapshot = buildWorkflowExecutionSnapshot(workflow);

		expect(snapshot.agent_graph.state_schema).toBe('{"type":"object"}');
		expect(snapshot.nodes[0]?.node.config).toBe(
			'{"max_iterations":2,"system_message":"Inspect it."}',
		);
		expect(snapshot.nodes[0]?.model?.config).toBe('{"temperature":0}');
		expect(snapshot.nodes[0]?.tools[0]?.input_schema).toBe('{"type":"object"}');
		expect(createWorkflowExecutionSnapshotHash(snapshot)).toMatch(
			/^[a-f0-9]{64}$/,
		);
		expect(
			createWorkflowExecutionSnapshotHash(
				buildWorkflowExecutionSnapshot({
					...workflow,
					agentGraphNodes: [...workflow.agentGraphNodes].reverse(),
					agentGraphEdges: [...workflow.agentGraphEdges].reverse(),
				}),
			),
		).toBe(createWorkflowExecutionSnapshotHash(snapshot));
	});
});
