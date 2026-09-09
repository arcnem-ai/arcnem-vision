import assert from "node:assert/strict";
import type { WorkflowDraft } from "@arcnem-vision/shared";
import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

// Run explicitly with an OAuth token, a project/document, and a one-worker source
// workflow. Creates a named copy and one real model execution; never edits the source.
// Required: MCP_TEST_URL, MCP_TEST_ACCESS_TOKEN, MCP_TEST_PROJECT_ID,
// MCP_TEST_DOCUMENT_ID, MCP_TEST_WORKFLOW_ID. Optional: MCP_TEST_SEARCH_QUERY,
// MCP_TEST_FORBIDDEN_PROJECT_ID, MCP_TEST_FORBIDDEN_ORGANIZATION_ID.
const expectedTools = [
	"list_projects",
	"list_workflows",
	"get_workflow",
	"get_workflow_catalog",
	"create_workflow",
	"update_workflow",
	"execute_workflow",
	"list_executions",
	"get_execution",
	"list_documents",
	"search_documents",
	"get_document",
];

type Workflow = {
	id: string;
	organizationId: string;
	revision: string;
	definition: WorkflowDraft;
};
type Execution = {
	executionId: string;
	workflowId: string;
	status: string;
	snapshotHash: string | null;
	finalState: Record<string, unknown> | null;
	steps?: unknown[];
};

function required(name: string) {
	const value = process.env[name]?.trim();
	assert(value, `Missing ${name}`);
	return value;
}

async function main() {
	const url = new URL(required("MCP_TEST_URL"));
	assert(
		!url.username && !url.password && !url.search,
		"Use a credential-free MCP endpoint URL",
	);
	assert(
		url.protocol === "https:" ||
			(url.protocol === "http:" &&
				["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)),
		"Use HTTPS, or HTTP on loopback for local tests",
	);
	const token = required("MCP_TEST_ACCESS_TOKEN");
	const projectId = required("MCP_TEST_PROJECT_ID");
	const documentId = required("MCP_TEST_DOCUMENT_ID");
	const sourceWorkflowId = required("MCP_TEST_WORKFLOW_ID");
	const client = new Client({
		name: "arcnem-vision-integration-test",
		version: "1.0.0",
	});
	const transport = new StreamableHTTPClientTransport(url, {
		authProvider: { token: async () => token },
	});
	const exercised = new Set<string>();

	async function call<T>(name: string, args: Record<string, unknown> = {}) {
		const result = await client.callTool({ name, arguments: args });
		assert(!result.isError, `${name} returned an MCP tool error`);
		assert(
			result.structuredContent && typeof result.structuredContent === "object",
			`${name} did not return structured content`,
		);
		exercised.add(name);
		return result.structuredContent as T;
	}
	async function reject(
		name: string,
		args: Record<string, unknown>,
		pattern: RegExp,
	) {
		const result = await client.callTool({ name, arguments: args });
		assert(result.isError, `${name} unexpectedly accepted an invalid request`);
		const message = result.content
			.flatMap((part) => (part.type === "text" ? [part.text] : []))
			.join("\n");
		assert(
			pattern.test(message),
			`${name} did not report the expected error category`,
		);
	}

	await client.connect(transport);
	try {
		const discovery = await client.listTools();
		assert.equal(
			discovery.tools.length,
			expectedTools.length,
			"Unexpected MCP tool count",
		);
		assert(
			expectedTools.every((name) =>
				discovery.tools.some((tool) => tool.name === name),
			),
			"Expected MCP tools missing",
		);
		console.log("Discovered all 12 tools.");

		const projects = await call<{
			projects: { id: string; organizationId: string }[];
		}>("list_projects", { limit: 100 });
		const project = projects.projects.find((item) => item.id === projectId);
		assert(project, "Test project is not visible to this OAuth user");
		const organizationId = project.organizationId;
		const workflows = await call<{ workflows: { id: string }[] }>(
			"list_workflows",
			{ organizationId, limit: 100 },
		);
		assert(
			workflows.workflows.some((item) => item.id === sourceWorkflowId),
			"Source workflow is not visible",
		);
		const source = await call<Workflow>("get_workflow", {
			organizationId,
			workflowId: sourceWorkflowId,
		});
		assert.equal(
			source.definition.nodes.length,
			1,
			"Choose a one-worker source workflow for this bounded execution test",
		);
		assert.equal(
			source.definition.nodes[0]?.nodeType,
			"worker",
			"Source node must be a worker",
		);
		const catalog = await call<{
			models: { id: string }[];
			tools: unknown[];
			nodeTypes: unknown[];
		}>("get_workflow_catalog", { organizationId });
		assert(
			catalog.models.some(
				(model) => model.id === source.definition.nodes[0]?.modelId,
			),
			"Source worker model is absent from catalog",
		);
		assert(
			Array.isArray(catalog.tools) && catalog.nodeTypes.length === 4,
			"Workflow catalog is incomplete",
		);
		const documents = await call<{ documents: { id: string }[] }>(
			"list_documents",
			{ projectId, limit: 1 },
		);
		assert(documents.documents.length > 0, "Project document list is empty");
		const document = await call<{ id: string; objectKey: string }>(
			"get_document",
			{ projectId, documentId },
		);
		assert.equal(
			document.id,
			documentId,
			"Document read returned a different document",
		);
		const search = await call<{ matches: { documentId: string }[] }>(
			"search_documents",
			{
				projectId,
				documentIds: [documentId],
				query: process.env.MCP_TEST_SEARCH_QUERY ?? document.objectKey,
				limit: 1,
			},
		);
		assert(
			search.matches.some((match) => match.documentId === documentId),
			"Scoped search did not return the selected document",
		);
		await call("list_executions", { projectId, limit: 1 });
		if (process.env.MCP_TEST_FORBIDDEN_PROJECT_ID) {
			await reject(
				"list_documents",
				{ projectId: process.env.MCP_TEST_FORBIDDEN_PROJECT_ID },
				/not found|forbidden|permission/i,
			);
		}
		if (process.env.MCP_TEST_FORBIDDEN_ORGANIZATION_ID) {
			await reject(
				"list_workflows",
				{ organizationId: process.env.MCP_TEST_FORBIDDEN_ORGANIZATION_ID },
				/not found|forbidden|permission/i,
			);
		}
		console.log(
			"Project, workflow, catalog, document, search, and execution reads passed.",
		);

		const marker = `mcp_probe_${crypto.randomUUID().replaceAll("-", "")}`;
		const copied = await call<{ id: string; revision: string }>(
			"create_workflow",
			{
				organizationId,
				definition: {
					...source.definition,
					name: `MCP integration ${new Date().toISOString()}`,
					description:
						"Created by the MCP integration probe. Safe to archive after inspection.",
					stateSchema: {
						mcp_probe_input: "overwrite",
						mcp_probe_output: "overwrite",
					},
					nodes: source.definition.nodes.map((node) => ({
						...node,
						inputKey: "mcp_probe_input",
						outputKey: "mcp_probe_output",
						toolIds: [],
						config: {
							system_message: "Reply with READY.",
							max_output_tokens: 512,
							reasoning_effort: "low",
						},
					})),
				},
			},
		);
		console.log(`Created test workflow ${copied.id}.`);
		const copy = await call<Workflow>("get_workflow", {
			organizationId,
			workflowId: copied.id,
		});
		assert.notEqual(
			copy.definition.nodes[0]?.id,
			source.definition.nodes[0]?.id,
			"Copy reused source node IDs",
		);
		const node = copy.definition.nodes[0];
		assert(node, "Copied worker is missing");
		const definition: WorkflowDraft = {
			...copy.definition,
			stateSchema: {
				mcp_probe_input: "overwrite",
				mcp_probe_output: "overwrite",
			},
			nodes: [
				{
					...node,
					inputKey: "mcp_probe_input",
					outputKey: "mcp_probe_output",
					toolIds: [],
					config: {
						system_message: `Reply with exactly ${marker} and nothing else.`,
						max_output_tokens: 512,
						reasoning_effort: "low",
					},
				},
			],
		};
		const updated = await call<{ id: string; revision: string }>(
			"update_workflow",
			{
				organizationId,
				workflowId: copy.id,
				expectedRevision: copy.revision,
				definition,
			},
		);
		assert.notEqual(
			updated.revision,
			copy.revision,
			"Update did not advance revision",
		);
		await reject(
			"update_workflow",
			{
				organizationId,
				workflowId: copy.id,
				expectedRevision: copy.revision,
				definition,
			},
			/409|changed since|revision/i,
		);
		const after = await call<Workflow>("get_workflow", {
			organizationId,
			workflowId: copy.id,
		});
		assert.equal(
			after.revision,
			updated.revision,
			"Rejected update changed revision",
		);
		assert.equal(
			after.definition.nodes[0]?.config?.system_message,
			definition.nodes[0]?.config?.system_message,
			"Worker prompt edit did not persist",
		);
		const sourceAfter = await call<Workflow>("get_workflow", {
			organizationId,
			workflowId: source.id,
		});
		assert(
			sourceAfter.revision === source.revision &&
				JSON.stringify(sourceAfter.definition) ===
					JSON.stringify(source.definition),
			"Source workflow changed during copy/edit",
		);
		console.log(
			"Copied graph edit and stale-revision rejection passed; source unchanged.",
		);

		const request = {
			projectId,
			workflowId: copy.id,
			documentIds: [documentId],
			initialState: {
				mcp_probe_input:
					"Return the exact marker specified by your system instruction.",
			},
			idempotencyKey: `mcp-integration-${crypto.randomUUID()}`,
		};
		const started = await call<Execution>("execute_workflow", request);
		const retried = await call<Execution>("execute_workflow", request);
		assert.equal(
			retried.executionId,
			started.executionId,
			"Execution retry created another run",
		);
		await reject(
			"execute_workflow",
			{ ...request, initialState: { mcp_probe_input: "Conflicting retry" } },
			/409|idempotency|different request/i,
		);
		console.log(
			`Started test execution ${started.executionId}; retry reused its ID and conflicting retry was rejected.`,
		);
		let execution: Execution | undefined;
		const deadline = Date.now() + 180_000;
		while (Date.now() < deadline) {
			execution = await call<Execution>("get_execution", {
				projectId,
				executionId: started.executionId,
				includeSteps: true,
			});
			if (execution.status !== "running") break;
			await Bun.sleep(3_000);
		}
		assert.equal(
			execution?.status,
			"completed",
			"Test execution failed or timed out; inspect its ID in the dashboard",
		);
		assert.equal(
			execution.workflowId,
			copy.id,
			"Execution used a different graph",
		);
		assert.equal(
			execution.finalState?.mcp_probe_output,
			marker,
			"Real model output did not match the edited prompt",
		);
		assert(
			/^[a-f0-9]{64}$/.test(execution.snapshotHash ?? ""),
			"Execution did not retain a graph snapshot hash",
		);
		assert(
			Array.isArray(execution.steps) && execution.steps.length > 0,
			"Execution did not expose node step results",
		);
		assert(
			exercised.size === expectedTools.length,
			"Probe did not exercise all 12 tools",
		);
		console.log(
			JSON.stringify({
				result: "passed",
				toolsExercised: exercised.size,
				workflowId: copy.id,
				executionId: execution.executionId,
				outputVerified: true,
			}),
		);
	} finally {
		await client.close();
	}
}

main().catch((error: unknown) => {
	console.error(
		error instanceof Error ? error.message : "MCP integration probe failed",
	);
	process.exitCode = 1;
});
