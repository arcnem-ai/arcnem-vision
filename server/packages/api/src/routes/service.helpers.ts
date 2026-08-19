import { createHash } from "node:crypto";
import {
	type ServiceDocumentListQuery,
	type ServiceDocumentScope,
	serviceDocumentListQuerySchema,
} from "@arcnem-vision/shared";

type ScopedDocumentSelection = {
	documentIds?: string[];
	scope?: ServiceDocumentScope;
};

function canonicalizeJSON(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalizeJSON);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
				.map(([key, child]) => [key, canonicalizeJSON(child)]),
		);
	}

	return value;
}

function createCanonicalJSONHash(input: unknown) {
	return createHash("sha256")
		.update(JSON.stringify(canonicalizeJSON(input)))
		.digest("hex");
}

export function createServiceIdempotencyRequestHash(input: unknown) {
	return createCanonicalJSONHash(input);
}

type WorkflowExecutionSnapshotSource = {
	id: string;
	name: string;
	description: string | null;
	entryNode: string;
	stateSchema: unknown | null;
	agentGraphTemplateId: string | null;
	agentGraphTemplateVersionId: string | null;
	organizationId: string;
	agentGraphNodes: Array<{
		id: string;
		nodeKey: string;
		nodeType: string;
		inputKey: string | null;
		outputKey: string | null;
		config: unknown;
		agentGraphId: string;
		modelId: string | null;
		models: {
			id: string;
			provider: string;
			name: string;
			type: string | null;
			embeddingDim: number | null;
			version: string;
			inputSchema: unknown | null;
			outputSchema: unknown | null;
			config: unknown;
		} | null;
		agentGraphNodeTools: Array<{
			tools: {
				id: string;
				name: string;
				description: string;
				inputSchema: unknown;
				outputSchema: unknown;
			};
		}>;
	}>;
	agentGraphEdges: Array<{
		id: string;
		fromNode: string;
		toNode: string;
		agentGraphId: string;
	}>;
};

function encodeJSONColumn(value: unknown) {
	const encoded = JSON.stringify(value);
	if (encoded === undefined) {
		throw new Error("Workflow snapshot contains an invalid JSON value");
	}
	return encoded;
}

function encodeNullableJSONColumn(value: unknown | null) {
	return value === null ? null : encodeJSONColumn(value);
}

export function buildWorkflowExecutionSnapshot(
	workflow: WorkflowExecutionSnapshotSource,
) {
	return {
		agent_graph: {
			id: workflow.id,
			name: workflow.name,
			description: workflow.description,
			entry_node: workflow.entryNode,
			state_schema: encodeNullableJSONColumn(workflow.stateSchema),
			agent_graph_template_id: workflow.agentGraphTemplateId,
			agent_graph_template_version_id: workflow.agentGraphTemplateVersionId,
			organization_id: workflow.organizationId,
		},
		nodes: [...workflow.agentGraphNodes]
			.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey))
			.map((node) => ({
				node: {
					id: node.id,
					node_key: node.nodeKey,
					node_type: node.nodeType,
					input_key: node.inputKey,
					output_key: node.outputKey,
					config: encodeJSONColumn(node.config),
					agent_graph_id: node.agentGraphId,
					model_id: node.modelId,
				},
				model: node.models
					? {
							id: node.models.id,
							provider: node.models.provider,
							name: node.models.name,
							type: node.models.type,
							embedding_dim: node.models.embeddingDim,
							version: node.models.version,
							input_schema: encodeNullableJSONColumn(node.models.inputSchema),
							output_schema: encodeNullableJSONColumn(node.models.outputSchema),
							config: encodeJSONColumn(node.models.config),
						}
					: null,
				tools: [...node.agentGraphNodeTools]
					.map(({ tools }) => tools)
					.sort(
						(left, right) =>
							left.name.localeCompare(right.name) ||
							left.id.localeCompare(right.id),
					)
					.map((tool) => ({
						id: tool.id,
						name: tool.name,
						description: tool.description,
						input_schema: encodeJSONColumn(tool.inputSchema),
						output_schema: encodeJSONColumn(tool.outputSchema),
					})),
			})),
		edges: [...workflow.agentGraphEdges]
			.sort(
				(left, right) =>
					left.fromNode.localeCompare(right.fromNode) ||
					left.toNode.localeCompare(right.toNode),
			)
			.map((edge) => ({
				id: edge.id,
				from_node: edge.fromNode,
				to_node: edge.toNode,
				agent_graph_id: edge.agentGraphId,
			})),
	};
}

export function createWorkflowExecutionSnapshotHash(snapshot: unknown) {
	return createCanonicalJSONHash(snapshot);
}

export function parseCSVList(value: string | undefined) {
	if (!value) {
		return undefined;
	}

	const items = value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);

	return items.length > 0 ? items : undefined;
}

export function parseBoolean(value: string | undefined) {
	if (value === undefined) {
		return undefined;
	}

	if (value === "true" || value === "1") {
		return true;
	}

	if (value === "false" || value === "0") {
		return false;
	}

	return undefined;
}

export function parseServiceDocumentListQuery(input: {
	limit?: string;
	cursor?: string;
	documentIds?: string;
	apiKeyIds?: string;
	apiKeyBound?: string;
}) {
	const trimmedLimit = input.limit?.trim();
	const hasLimit = Boolean(trimmedLimit && trimmedLimit.length > 0);
	const rawLimit = hasLimit
		? Number.parseInt(trimmedLimit ?? "", 10)
		: undefined;
	const parsedAPIKeyBound = parseBoolean(input.apiKeyBound);
	if (input.apiKeyBound !== undefined && parsedAPIKeyBound === undefined) {
		return {
			ok: false as const,
			message: "apiKeyBound must be true or false",
		};
	}

	const parsed = serviceDocumentListQuerySchema.safeParse({
		limit: hasLimit ? rawLimit : undefined,
		cursor: input.cursor?.trim() || undefined,
		documentIds: parseCSVList(input.documentIds),
		apiKeyIds: parseCSVList(input.apiKeyIds),
		apiKeyBound: parsedAPIKeyBound,
	});

	if (!parsed.success) {
		return {
			ok: false as const,
			message: parsed.error.issues[0]?.message ?? "Invalid document filters",
		};
	}

	return {
		ok: true as const,
		data: parsed.data satisfies ServiceDocumentListQuery,
	};
}

export function mergeRequestedDocumentIds(input: ScopedDocumentSelection) {
	return Array.from(
		new Set([
			...(input.documentIds ?? []),
			...(input.scope?.documentIds ?? []),
		]),
	);
}

export function buildExecutionScope(
	scope: ServiceDocumentScope | undefined,
	documentIds: string[],
): ServiceDocumentScope & { documentIds: string[] } {
	return {
		...(scope ?? {}),
		documentIds,
	};
}

export function buildServiceDocumentSearchScope(
	apiKey: { organizationId: string; projectId: string },
	documentIds: string[],
) {
	return {
		organization_id: apiKey.organizationId,
		project_ids: [apiKey.projectId],
		document_ids: documentIds,
	};
}

export function buildSeededInitialState<T extends Record<string, unknown>>(
	initialState: T | undefined,
	projectId: string,
	executionScope: ReturnType<typeof buildExecutionScope>,
): T & {
	project_id: string;
	scope: ReturnType<typeof buildExecutionScope>;
} {
	return {
		...(initialState ?? ({} as T)),
		project_id: projectId,
		scope: executionScope,
	};
}

export function buildWorkflowExecutionEventData<
	T extends Record<string, unknown>,
>(
	executionId: string,
	workflowId: string,
	organizationId: string,
	documentIds: string[],
	executionScope: ReturnType<typeof buildExecutionScope>,
	initialState: T,
) {
	return {
		execution_id: executionId,
		workflow_id: workflowId,
		organization_id: organizationId,
		document_ids: documentIds,
		scope: executionScope,
		initial_state: initialState,
	};
}
