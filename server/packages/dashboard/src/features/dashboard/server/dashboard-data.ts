import { getDB } from "@arcnem-vision/db/server";
import { createServerFn } from "@tanstack/react-start";
import type {
	DashboardData,
	WorkflowNodeConfig,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import { getSessionContext } from "./session-context";
import { parseCanvasPosition } from "./workflow-normalization";

function normalizeJSONSchema(schema: unknown): unknown {
	if (typeof schema === "string") {
		try {
			return JSON.parse(schema);
		} catch {
			return schema;
		}
	}
	return schema;
}

function schemaFieldNames(schema: unknown) {
	const normalized = normalizeJSONSchema(schema);
	if (
		!normalized ||
		typeof normalized !== "object" ||
		Array.isArray(normalized)
	) {
		return [] as string[];
	}
	const properties = (normalized as { properties?: unknown }).properties;
	if (
		!properties ||
		typeof properties !== "object" ||
		Array.isArray(properties)
	) {
		return [] as string[];
	}
	return Object.keys(properties as Record<string, unknown>);
}

function normalizeNodeConfig(config: unknown): WorkflowNodeConfig {
	if (typeof config === "string") {
		try {
			const parsed = JSON.parse(config);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return {};
			}
			const normalized = { ...(parsed as WorkflowNodeConfig) };
			delete normalized.uiPosition;
			return normalized;
		} catch {
			return {};
		}
	}
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		return {};
	}
	const normalized = { ...(config as WorkflowNodeConfig) };
	delete normalized.uiPosition;
	return normalized;
}

function toToolOption(tool: {
	id: string;
	name: string;
	description: string;
	inputSchema: unknown;
	outputSchema: unknown;
}): WorkflowToolOption {
	const inputSchema = normalizeJSONSchema(tool.inputSchema);
	const outputSchema = normalizeJSONSchema(tool.outputSchema);
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

export const getDashboardData = createServerFn({ method: "GET" }).handler(
	async (): Promise<DashboardData> => {
		const db = getDB();
		const context = await getSessionContext();
		const organizationId = context.organizationId;

		const modelRows = await db.query.models.findMany({
			columns: {
				id: true,
				provider: true,
				name: true,
				type: true,
			},
			orderBy: (row, { asc }) => [asc(row.provider), asc(row.name)],
		});
		const toolRows = await db.query.tools.findMany({
			columns: {
				id: true,
				name: true,
				description: true,
				inputSchema: true,
				outputSchema: true,
			},
			orderBy: (row, { asc }) => [asc(row.name)],
		});

		const modelCatalog = modelRows.map((model) => ({
			id: model.id,
			provider: model.provider,
			name: model.name,
			type: model.type,
			label: `${model.provider} / ${model.name}`,
		}));
		const toolCatalog = toolRows.map((tool) => toToolOption(tool));

		if (!context.session) {
			return {
				auth: {
					state: "missing",
					source: context.source,
					sessionPreview: context.sessionPreview,
					userName: null,
					userEmail: null,
				},
				organization: null,
				projects: [],
				devices: [],
				workflows: [],
				modelCatalog,
				toolCatalog,
			};
		}

		if (!organizationId) {
			return {
				auth: {
					state: "ready",
					source: context.source,
					sessionPreview: context.sessionPreview,
					userName: context.user?.name ?? null,
					userEmail: context.user?.email ?? null,
				},
				organization: null,
				projects: [],
				devices: [],
				workflows: [],
				modelCatalog,
				toolCatalog,
			};
		}

		const organization = await db.query.organizations.findFirst({
			where: (row, { eq }) => eq(row.id, organizationId),
			columns: {
				id: true,
				name: true,
				slug: true,
			},
		});

		if (!organization) {
			return {
				auth: {
					state: "ready",
					source: context.source,
					sessionPreview: context.sessionPreview,
					userName: context.user?.name ?? null,
					userEmail: context.user?.email ?? null,
				},
				organization: null,
				projects: [],
				devices: [],
				workflows: [],
				modelCatalog,
				toolCatalog,
			};
		}

		const projectRows = await db.query.projects.findMany({
			where: (row, { eq }) => eq(row.organizationId, organizationId),
			columns: {
				id: true,
				name: true,
				slug: true,
			},
			orderBy: (row, { asc }) => [asc(row.name)],
		});

		const deviceRows = await db.query.devices.findMany({
			where: (row, { eq }) => eq(row.organizationId, organizationId),
			columns: {
				id: true,
				name: true,
				slug: true,
				projectId: true,
				agentGraphId: true,
				updatedAt: true,
			},
			with: {
				agentGraphs: {
					columns: {
						name: true,
					},
				},
			},
			orderBy: (row, { asc }) => [asc(row.name)],
		});

		const workflowRows = await db.query.agentGraphs.findMany({
			where: (row, { eq }) => eq(row.organizationId, organizationId),
			columns: {
				id: true,
				name: true,
				description: true,
				entryNode: true,
			},
			with: {
				agentGraphNodes: {
					columns: {
						id: true,
						nodeKey: true,
						nodeType: true,
						inputKey: true,
						outputKey: true,
						modelId: true,
						config: true,
					},
					with: {
						models: {
							columns: {
								provider: true,
								name: true,
							},
						},
						agentGraphNodeTools: {
							with: {
								tools: {
									columns: {
										id: true,
										name: true,
										description: true,
										inputSchema: true,
										outputSchema: true,
									},
								},
							},
						},
					},
				},
				agentGraphEdges: {
					columns: {
						id: true,
						fromNode: true,
						toNode: true,
					},
				},
			},
			orderBy: (row, { asc }) => [asc(row.name)],
		});

		const deviceCountByProjectId = new Map<string, number>();
		for (const device of deviceRows) {
			deviceCountByProjectId.set(
				device.projectId,
				(deviceCountByProjectId.get(device.projectId) ?? 0) + 1,
			);
		}

		const attachedDeviceCountByWorkflowId = new Map<string, number>();
		for (const device of deviceRows) {
			attachedDeviceCountByWorkflowId.set(
				device.agentGraphId,
				(attachedDeviceCountByWorkflowId.get(device.agentGraphId) ?? 0) + 1,
			);
		}

		const mappedProjects = projectRows.map((project) => ({
			...project,
			deviceCount: deviceCountByProjectId.get(project.id) ?? 0,
		}));

		const mappedDevices = deviceRows.map((device) => {
			const updatedAt = new Date(device.updatedAt);
			const status: "connected" | "idle" =
				Date.now() - updatedAt.valueOf() < 1000 * 60 * 60 * 24
					? "connected"
					: "idle";

			return {
				id: device.id,
				name: device.name,
				slug: device.slug,
				projectId: device.projectId,
				agentGraphId: device.agentGraphId,
				workflowName: device.agentGraphs?.name ?? null,
				updatedAt: updatedAt.toISOString(),
				status,
			};
		});

		const mappedWorkflows = workflowRows.map((workflow) => {
			const nodes = workflow.agentGraphNodes.map((node, index) => {
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
					config: normalizeNodeConfig(node.config),
				};
			});

			const nodeTypeCounts = {
				worker: 0,
				supervisor: 0,
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
					case "tool":
						nodeTypeCounts.tool += 1;
						break;
					default:
						nodeTypeCounts.other += 1;
						break;
				}
			}

			return {
				id: workflow.id,
				name: workflow.name,
				description: workflow.description,
				entryNode: workflow.entryNode,
				edgeCount: workflow.agentGraphEdges.length,
				attachedDeviceCount:
					attachedDeviceCountByWorkflowId.get(workflow.id) ?? 0,
				nodeTypeCounts,
				nodes,
				edges: workflow.agentGraphEdges.map((edge) => ({
					id: edge.id,
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
		});

		return {
			auth: {
				state: "ready",
				source: context.source,
				sessionPreview: context.sessionPreview,
				userName: context.user?.name ?? null,
				userEmail: context.user?.email ?? null,
			},
			organization,
			projects: mappedProjects,
			devices: mappedDevices,
			workflows: mappedWorkflows,
			modelCatalog,
			toolCatalog,
		};
	},
);
