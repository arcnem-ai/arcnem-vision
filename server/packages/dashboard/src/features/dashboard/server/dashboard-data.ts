import { getDB } from "@arcnem-vision/db/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type {
	DashboardData,
	WorkflowNodeConfig,
	WorkflowNodeTypeCounts,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import { getSessionContext } from "./session-context";
import { parseCanvasPosition } from "./workflow-normalization";

function normalizeToolSchema(schema: unknown): Record<string, unknown> {
	if (typeof schema === "string") {
		try {
			const parsed = JSON.parse(schema);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
		} catch {
			return {};
		}
	}
	if (schema && typeof schema === "object" && !Array.isArray(schema)) {
		return schema as Record<string, unknown>;
	}
	return {};
}

function schemaFieldNames(schema: Record<string, unknown>) {
	const properties = schema.properties;
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

function countNodeTypes(
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
		const toolOptionById = new Map(
			toolCatalog.map((tool) => [tool.id, tool] as const),
		);

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
				workflowTemplates: [],
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
				workflowTemplates: [],
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
				workflowTemplates: [],
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
				apikeys: {
					columns: {
						id: true,
						name: true,
						start: true,
						prefix: true,
						enabled: true,
						createdAt: true,
						updatedAt: true,
						lastRequest: true,
						expiresAt: true,
						requestCount: true,
						rateLimitEnabled: true,
						rateLimitMax: true,
						rateLimitTimeWindow: true,
					},
					orderBy: (row, { desc, asc }) => [desc(row.createdAt), asc(row.id)],
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
				agentGraphTemplateId: true,
				agentGraphTemplateVersion: true,
			},
			with: {
				agentGraphTemplates: {
					columns: {
						id: true,
						name: true,
					},
				},
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

		const templateRows = await db.query.agentGraphTemplates.findMany({
			where: (row) =>
				or(
					eq(row.organizationId, organizationId),
					and(isNull(row.organizationId), eq(row.visibility, "public")),
				),
			columns: {
				id: true,
				name: true,
				description: true,
				version: true,
				visibility: true,
				entryNode: true,
			},
			with: {
				agentGraphTemplateNodes: {
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
					},
				},
				agentGraphTemplateEdges: {
					columns: {
						id: true,
						fromNode: true,
						toNode: true,
					},
				},
			},
			orderBy: (row, { asc, desc }) => [asc(row.name), desc(row.version)],
		});

		const templateNodeIds = templateRows.flatMap((template) =>
			template.agentGraphTemplateNodes.map((node) => node.id),
		);
		const templateNodeToolRows =
			templateNodeIds.length === 0
				? []
				: await db.query.agentGraphTemplateNodeTools.findMany({
						where: (row) =>
							inArray(row.agentGraphTemplateNodeId, templateNodeIds),
						columns: {
							agentGraphTemplateNodeId: true,
							toolId: true,
						},
					});
		const templateToolIdsByNodeId = new Map<string, string[]>();
		for (const link of templateNodeToolRows) {
			const current = templateToolIdsByNodeId.get(
				link.agentGraphTemplateNodeId,
			);
			if (current) {
				current.push(link.toolId);
			} else {
				templateToolIdsByNodeId.set(link.agentGraphTemplateNodeId, [
					link.toolId,
				]);
			}
		}

		const deviceCountByProjectId = new Map<string, number>();
		const apiKeyCountByProjectId = new Map<string, number>();
		for (const device of deviceRows) {
			deviceCountByProjectId.set(
				device.projectId,
				(deviceCountByProjectId.get(device.projectId) ?? 0) + 1,
			);
			apiKeyCountByProjectId.set(
				device.projectId,
				(apiKeyCountByProjectId.get(device.projectId) ?? 0) +
					device.apikeys.length,
			);
		}

		const attachedDeviceCountByWorkflowId = new Map<string, number>();
		for (const device of deviceRows) {
			attachedDeviceCountByWorkflowId.set(
				device.agentGraphId,
				(attachedDeviceCountByWorkflowId.get(device.agentGraphId) ?? 0) + 1,
			);
		}

		const startedWorkflowCountByTemplateId = new Map<string, number>();
		for (const workflow of workflowRows) {
			if (!workflow.agentGraphTemplateId) {
				continue;
			}

			startedWorkflowCountByTemplateId.set(
				workflow.agentGraphTemplateId,
				(startedWorkflowCountByTemplateId.get(workflow.agentGraphTemplateId) ??
					0) + 1,
			);
		}

		const mappedProjects = projectRows.map((project) => ({
			...project,
			deviceCount: deviceCountByProjectId.get(project.id) ?? 0,
			apiKeyCount: apiKeyCountByProjectId.get(project.id) ?? 0,
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
				apiKeyCount: device.apikeys.length,
				apiKeys: device.apikeys.map((apiKey) => ({
					id: apiKey.id,
					name: apiKey.name,
					start: apiKey.start,
					prefix: apiKey.prefix,
					enabled: apiKey.enabled,
					createdAt: apiKey.createdAt.toISOString(),
					updatedAt: apiKey.updatedAt.toISOString(),
					lastRequest: apiKey.lastRequest?.toISOString() ?? null,
					expiresAt: apiKey.expiresAt?.toISOString() ?? null,
					requestCount: apiKey.requestCount,
					rateLimitEnabled: apiKey.rateLimitEnabled,
					rateLimitMax: apiKey.rateLimitMax,
					rateLimitTimeWindow: apiKey.rateLimitTimeWindow,
				})),
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

			return {
				id: workflow.id,
				name: workflow.name,
				description: workflow.description,
				entryNode: workflow.entryNode,
				edgeCount: workflow.agentGraphEdges.length,
				attachedDeviceCount:
					attachedDeviceCountByWorkflowId.get(workflow.id) ?? 0,
				template: workflow.agentGraphTemplates
					? {
							id: workflow.agentGraphTemplates.id,
							name: workflow.agentGraphTemplates.name,
							version: workflow.agentGraphTemplateVersion,
						}
					: null,
				nodeTypeCounts: countNodeTypes(nodes),
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

		const mappedWorkflowTemplates = templateRows.map((template) => {
			const nodes = template.agentGraphTemplateNodes.map((node, index) => {
				const position = parseCanvasPosition(node.config, index);
				const toolIds = templateToolIdsByNodeId.get(node.id) ?? [];
				const tools = toolIds
					.map((toolId) => toolOptionById.get(toolId))
					.filter((tool): tool is WorkflowToolOption => Boolean(tool));

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
					toolIds,
					tools,
					toolNames: tools.map((tool) => tool.name),
					config: normalizeNodeConfig(node.config),
				};
			});

			return {
				id: template.id,
				name: template.name,
				description: template.description,
				version: template.version,
				visibility: template.visibility,
				entryNode: template.entryNode,
				edgeCount: template.agentGraphTemplateEdges.length,
				startedWorkflowCount:
					startedWorkflowCountByTemplateId.get(template.id) ?? 0,
				nodeTypeCounts: countNodeTypes(nodes),
				nodes,
				edges: template.agentGraphTemplateEdges.map((edge) => ({
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
			workflowTemplates: mappedWorkflowTemplates,
			modelCatalog,
			toolCatalog,
		};
	},
);
