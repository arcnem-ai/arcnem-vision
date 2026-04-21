import type {
	WorkflowNodeTypeCounts,
	WorkflowSchemaObject,
	WorkflowTemplateSummary,
	WorkflowToolOption,
} from "@arcnem-vision/shared";
import {
	normalizePersistedWorkflowNodeConfig,
	normalizeWorkflowTemplateVisibility,
	parseCanvasPosition,
	type WorkflowTemplateSnapshot,
} from "@arcnem-vision/shared";

function normalizeToolSchema(schema: unknown): WorkflowSchemaObject {
	if (typeof schema === "string") {
		try {
			const parsed = JSON.parse(schema);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as WorkflowSchemaObject;
			}
		} catch {
			return {};
		}
	}
	if (schema && typeof schema === "object" && !Array.isArray(schema)) {
		return schema as WorkflowSchemaObject;
	}
	return {};
}

function schemaFieldNames(schema: WorkflowSchemaObject) {
	const properties = schema.properties;
	if (
		!properties ||
		typeof properties !== "object" ||
		Array.isArray(properties)
	) {
		return [] as string[];
	}

	return Object.keys(properties as WorkflowSchemaObject);
}

export function toToolOption(tool: {
	id: string;
	name: string;
	description: string;
	inputSchema: unknown;
	outputSchema: unknown;
}): WorkflowToolOption {
	const inputSchema = normalizeToolSchema(tool.inputSchema);
	const outputSchema = normalizeToolSchema(tool.outputSchema);

	return {
		id: tool.id,
		name: tool.name,
		description: tool.description,
		inputSchema,
		outputSchema,
		inputFields: schemaFieldNames(inputSchema),
		outputFields: schemaFieldNames(outputSchema),
	};
}

export function countNodeTypes(
	nodes: Array<{
		nodeType: string;
	}>,
): WorkflowNodeTypeCounts {
	const nodeTypeCounts: WorkflowNodeTypeCounts = {
		worker: 0,
		supervisor: 0,
		condition: 0,
		tool: 0,
		other: 0,
	};

	for (const node of nodes) {
		switch (node.nodeType) {
			case "worker":
				nodeTypeCounts.worker += 1;
				break;
			case "supervisor":
				nodeTypeCounts.supervisor += 1;
				break;
			case "condition":
				nodeTypeCounts.condition += 1;
				break;
			case "tool":
				nodeTypeCounts.tool += 1;
				break;
			default:
				nodeTypeCounts.other += 1;
				break;
		}
	}

	return nodeTypeCounts;
}

export function mapTemplateSummaryFromSnapshot(input: {
	templateId: string;
	versionId: string;
	version: number;
	versionCount: number;
	archivedAt: string | null;
	snapshot: WorkflowTemplateSnapshot;
	visibility: string;
	canEdit: boolean;
	startedWorkflowCount: number;
	modelLabelById: Map<string, string>;
	toolOptionById: Map<string, WorkflowToolOption>;
}): WorkflowTemplateSummary {
	const nodes = input.snapshot.nodes.map((node) => {
		const tools = node.toolIds
			.map((toolId) => input.toolOptionById.get(toolId))
			.filter((tool): tool is WorkflowToolOption => Boolean(tool));

		return {
			id: `${input.versionId}:${node.nodeKey}`,
			nodeKey: node.nodeKey,
			nodeType: node.nodeType,
			x: node.x,
			y: node.y,
			inputKey: node.inputKey,
			outputKey: node.outputKey,
			modelId: node.modelId,
			modelLabel: node.modelId
				? (input.modelLabelById.get(node.modelId) ?? null)
				: null,
			toolIds: node.toolIds,
			tools,
			toolNames: tools.map((tool) => tool.name),
			config: node.config,
		};
	});

	return {
		id: input.templateId,
		name: input.snapshot.name,
		description: input.snapshot.description,
		archivedAt: input.archivedAt,
		version: input.version,
		versionCount: input.versionCount,
		visibility: normalizeWorkflowTemplateVisibility(input.visibility),
		canEdit: input.canEdit,
		entryNode: input.snapshot.entryNode,
		edgeCount: input.snapshot.edges.length,
		startedWorkflowCount: input.startedWorkflowCount,
		nodeTypeCounts: countNodeTypes(nodes),
		nodes,
		edges: input.snapshot.edges.map((edge) => ({
			id: `${input.versionId}:${edge.fromNode}->${edge.toNode}`,
			fromNode: edge.fromNode,
			toNode: edge.toNode,
		})),
		nodeSamples: nodes.slice(0, 6).map((node) => ({
			id: node.id,
			nodeKey: node.nodeKey,
			nodeType: node.nodeType,
			toolNames: node.toolNames,
		})),
	};
}

export function mapPersistedWorkflowNode(
	node: {
		id: string;
		nodeKey: string;
		nodeType: string;
		inputKey: string | null;
		outputKey: string | null;
		modelId: string | null;
		config: unknown;
		models?: { provider: string; name: string } | null;
		agentGraphNodeTools: Array<{
			tools: {
				id: string;
				name: string;
				description: string;
				inputSchema: unknown;
				outputSchema: unknown;
			};
		}>;
	},
	index: number,
) {
	const position = parseCanvasPosition(node.config, index);
	const tools = node.agentGraphNodeTools
		.map((item) => toToolOption(item.tools))
		.filter(Boolean);

	return {
		id: node.id,
		nodeKey: node.nodeKey,
		nodeType: node.nodeType,
		x: position.x,
		y: position.y,
		inputKey: node.inputKey,
		outputKey: node.outputKey,
		modelId: node.modelId,
		modelLabel: node.models
			? `${node.models.provider} / ${node.models.name}`
			: null,
		toolIds: tools.map((tool) => tool.id),
		tools,
		toolNames: tools.map((tool) => tool.name),
		config: normalizePersistedWorkflowNodeConfig(node.config),
	};
}
