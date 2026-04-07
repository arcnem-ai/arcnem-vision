import { getDB } from "@arcnem-vision/db/server";
import { getAuthFeatureFlags } from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import type {
	WorkflowNodeTypeCounts,
	WorkflowSchemaObject,
	WorkflowTemplateSummary,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import { getSessionContext } from "./session-context";
import { parseCanvasPosition } from "./workflow-normalization";
import { buildWorkflowTemplateAccessCondition } from "./workflow-template-access";
import {
	normalizePersistedWorkflowNodeConfig,
	parseWorkflowTemplateSnapshot,
} from "./workflow-template-snapshot";
import { normalizeWorkflowTemplateVisibility } from "./workflow-template-utils";

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

function mapTemplateSummaryFromSnapshot(input: {
	templateId: string;
	versionId: string;
	version: number;
	versionCount: number;
	snapshot: NonNullable<ReturnType<typeof parseWorkflowTemplateSnapshot>>;
	visibility: ReturnType<typeof normalizeWorkflowTemplateVisibility>;
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
		version: input.version,
		versionCount: input.versionCount,
		visibility: input.visibility,
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

const debugSessionBootstrapEnabled = process.env.API_DEBUG === "true";

type GetDashboardDataInput = {
	includeArchived?: boolean;
};

export const getDashboardData = createServerFn({ method: "GET" })
	.inputValidator((input: GetDashboardDataInput | undefined) => input ?? {})
	.handler(async ({ data }) => {
		const db = getDB();
		const authFeatureFlags = getAuthFeatureFlags();
		const context = await getSessionContext();
		const organizationId = context.organizationId;
		const includeArchived = data.includeArchived === true;
		const organizationOptions = context.organizations.map((organization) => ({
			id: organization.organizationId,
			name: organization.name,
			slug: organization.slug,
			role: organization.role,
		}));

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
		const modelLabelById = new Map(
			modelCatalog.map((model) => [model.id, model.label] as const),
		);
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
					activeOrganizationId: null,
					signUpEnabled: authFeatureFlags.signUpEnabled,
					organizationCreationEnabled:
						authFeatureFlags.organizationCreationEnabled,
					debugSessionBootstrapEnabled,
				},
				organizations: [],
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
					activeOrganizationId: context.session.activeOrganizationId,
					signUpEnabled: authFeatureFlags.signUpEnabled,
					organizationCreationEnabled:
						authFeatureFlags.organizationCreationEnabled,
					debugSessionBootstrapEnabled,
				},
				organizations: organizationOptions,
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
					activeOrganizationId: context.session.activeOrganizationId,
					signUpEnabled: authFeatureFlags.signUpEnabled,
					organizationCreationEnabled:
						authFeatureFlags.organizationCreationEnabled,
					debugSessionBootstrapEnabled,
				},
				organizations: organizationOptions,
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
			where: (row) =>
				includeArchived
					? eq(row.organizationId, organizationId)
					: and(eq(row.organizationId, organizationId), isNull(row.archivedAt)),
			columns: {
				id: true,
				name: true,
				slug: true,
				archivedAt: true,
			},
			orderBy: (row, { asc }) => [asc(row.name)],
		});

		const deviceRows = await db.query.devices.findMany({
			where: (row) =>
				includeArchived
					? eq(row.organizationId, organizationId)
					: and(eq(row.organizationId, organizationId), isNull(row.archivedAt)),
			columns: {
				id: true,
				name: true,
				slug: true,
				projectId: true,
				agentGraphId: true,
				archivedAt: true,
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
				agentGraphTemplateVersionId: true,
			},
			with: {
				agentGraphTemplateVersions: {
					columns: {
						id: true,
						version: true,
						snapshot: true,
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
			where: (row) => buildWorkflowTemplateAccessCondition(row, organizationId),
			columns: {
				id: true,
				visibility: true,
				organizationId: true,
			},
			with: {
				currentVersion: {
					columns: {
						id: true,
						version: true,
						snapshot: true,
					},
				},
				agentGraphTemplateVersions: {
					columns: {
						id: true,
					},
				},
			},
			orderBy: (row, { asc }) => [asc(row.createdAt)],
		});

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
			archivedAt: project.archivedAt?.toISOString() ?? null,
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
				archivedAt: device.archivedAt?.toISOString() ?? null,
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
					config: normalizePersistedWorkflowNodeConfig(node.config),
				};
			});

			const templateSnapshot = workflow.agentGraphTemplateVersions
				? parseWorkflowTemplateSnapshot(
						workflow.agentGraphTemplateVersions.snapshot,
					)
				: null;

			return {
				id: workflow.id,
				name: workflow.name,
				description: workflow.description,
				entryNode: workflow.entryNode,
				edgeCount: workflow.agentGraphEdges.length,
				attachedDeviceCount:
					attachedDeviceCountByWorkflowId.get(workflow.id) ?? 0,
				template:
					workflow.agentGraphTemplateId &&
					workflow.agentGraphTemplateVersions &&
					templateSnapshot
						? {
								id: workflow.agentGraphTemplateId,
								name: templateSnapshot.name,
								version: workflow.agentGraphTemplateVersions.version,
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

		const mappedWorkflowTemplates = templateRows
			.flatMap((template) => {
				const snapshot = template.currentVersion
					? parseWorkflowTemplateSnapshot(template.currentVersion.snapshot)
					: null;
				if (!snapshot || !template.currentVersion) {
					return [];
				}

				return [
					mapTemplateSummaryFromSnapshot({
						templateId: template.id,
						versionId: template.currentVersion.id,
						version: template.currentVersion.version,
						versionCount: template.agentGraphTemplateVersions.length,
						snapshot,
						visibility: normalizeWorkflowTemplateVisibility(
							template.visibility,
						),
						canEdit: template.organizationId === organizationId,
						startedWorkflowCount:
							startedWorkflowCountByTemplateId.get(template.id) ?? 0,
						modelLabelById,
						toolOptionById,
					}),
				];
			})
			.sort((left, right) => left.name.localeCompare(right.name));

		return {
			auth: {
				state: "ready",
				source: context.source,
				sessionPreview: context.sessionPreview,
				userName: context.user?.name ?? null,
				userEmail: context.user?.email ?? null,
				activeOrganizationId: context.session.activeOrganizationId,
				signUpEnabled: authFeatureFlags.signUpEnabled,
				organizationCreationEnabled:
					authFeatureFlags.organizationCreationEnabled,
				debugSessionBootstrapEnabled,
			},
			organizations: organizationOptions,
			organization,
			projects: mappedProjects,
			devices: mappedDevices,
			workflows: mappedWorkflows,
			workflowTemplates: mappedWorkflowTemplates,
			modelCatalog,
			toolCatalog,
		};
	});
