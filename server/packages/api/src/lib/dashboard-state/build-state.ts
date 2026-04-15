import {
	type DashboardData,
	parseWorkflowTemplateSnapshot,
} from "@arcnem-vision/shared";
import type { Context } from "hono";
import type { HonoServerContext } from "@/types/serverContext";
import { getDashboardSessionContext } from "../dashboard-auth";
import { buildDashboardAuthPayload } from "./auth-payload";
import { loadDashboardCatalog } from "./catalog";
import {
	loadDashboardDevices,
	loadDashboardOrganization,
	loadDashboardProjects,
	loadDashboardServiceAPIKeys,
	loadDashboardWorkflows,
	loadDashboardWorkflowTemplates,
} from "./queries";
import {
	countNodeTypes,
	mapPersistedWorkflowNode,
	mapTemplateSummaryFromSnapshot,
} from "./serializers";

export async function buildDashboardState(
	c: Context<HonoServerContext>,
	includeArchived: boolean,
): Promise<DashboardData> {
	const db = c.get("dbClient");
	const context = await getDashboardSessionContext(c);
	const organizationId = context.organizationId;
	const organizationOptions = context.organizations.map((organization) => ({
		id: organization.organizationId,
		name: organization.name,
		slug: organization.slug,
		role: organization.role,
	}));
	const auth = buildDashboardAuthPayload(context);
	const { modelCatalog, modelLabelById, toolCatalog, toolOptionById } =
		await loadDashboardCatalog(db);

	if (!context.session) {
		return {
			auth,
			organizations: [],
			organization: null,
			projects: [],
			devices: [],
			serviceApiKeys: [],
			workflows: [],
			workflowTemplates: [],
			modelCatalog,
			toolCatalog,
		};
	}

	if (!organizationId) {
		return {
			auth,
			organizations: organizationOptions,
			organization: null,
			projects: [],
			devices: [],
			serviceApiKeys: [],
			workflows: [],
			workflowTemplates: [],
			modelCatalog,
			toolCatalog,
		};
	}

	const organization = await loadDashboardOrganization(db, organizationId);

	if (!organization) {
		return {
			auth,
			organizations: organizationOptions,
			organization: null,
			projects: [],
			devices: [],
			serviceApiKeys: [],
			workflows: [],
			workflowTemplates: [],
			modelCatalog,
			toolCatalog,
		};
	}

	const [projectRows, deviceRows, serviceKeyRows, workflowRows, templateRows] =
		await Promise.all([
			loadDashboardProjects(db, organizationId, includeArchived),
			loadDashboardDevices(db, organizationId, includeArchived),
			loadDashboardServiceAPIKeys(db, organizationId, includeArchived),
			loadDashboardWorkflows(db, organizationId),
			loadDashboardWorkflowTemplates(db, organizationId),
		]);

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
	const serviceApiKeyCountByProjectId = new Map<string, number>();
	for (const apiKey of serviceKeyRows) {
		serviceApiKeyCountByProjectId.set(
			apiKey.projectId,
			(serviceApiKeyCountByProjectId.get(apiKey.projectId) ?? 0) + 1,
		);
		apiKeyCountByProjectId.set(
			apiKey.projectId,
			(apiKeyCountByProjectId.get(apiKey.projectId) ?? 0) + 1,
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

	return {
		auth,
		organizations: organizationOptions,
		organization,
		projects: projectRows.map((project) => ({
			...project,
			archivedAt: project.archivedAt?.toISOString() ?? null,
			deviceCount: deviceCountByProjectId.get(project.id) ?? 0,
			apiKeyCount: apiKeyCountByProjectId.get(project.id) ?? 0,
			serviceApiKeyCount: serviceApiKeyCountByProjectId.get(project.id) ?? 0,
		})),
		devices: deviceRows.map((device) => {
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
		}),
		serviceApiKeys: serviceKeyRows.map((apiKey) => ({
			id: apiKey.id,
			projectId: apiKey.projectId,
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
		workflows: workflowRows.map((workflow) => {
			const nodes = workflow.agentGraphNodes.map((node, index) =>
				mapPersistedWorkflowNode(node, index),
			);
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
		}),
		workflowTemplates: templateRows
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
						visibility: template.visibility,
						canEdit: template.organizationId === organizationId,
						startedWorkflowCount:
							startedWorkflowCountByTemplateId.get(template.id) ?? 0,
						modelLabelById,
						toolOptionById,
					}),
				];
			})
			.sort((left, right) => left.name.localeCompare(right.name)),
		modelCatalog,
		toolCatalog,
	};
}
