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
	loadDashboardOrganization,
	loadDashboardProjects,
	loadDashboardServiceAPIKeys,
	loadDashboardWorkflowAPIKeys,
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
			workflowApiKeys: [],
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
			workflowApiKeys: [],
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
			workflowApiKeys: [],
			serviceApiKeys: [],
			workflows: [],
			workflowTemplates: [],
			modelCatalog,
			toolCatalog,
		};
	}

	const [
		projectRows,
		workflowKeyRows,
		serviceKeyRows,
		workflowRows,
		templateRows,
	] = await Promise.all([
		loadDashboardProjects(db, organizationId, includeArchived),
		loadDashboardWorkflowAPIKeys(db, organizationId, includeArchived),
		loadDashboardServiceAPIKeys(db, organizationId, includeArchived),
		loadDashboardWorkflows(db, organizationId, includeArchived),
		loadDashboardWorkflowTemplates(db, organizationId, includeArchived),
	]);

	const workflowApiKeyCountByProjectId = new Map<string, number>();
	const apiKeyCountByProjectId = new Map<string, number>();
	for (const apiKey of workflowKeyRows) {
		workflowApiKeyCountByProjectId.set(
			apiKey.projectId,
			(workflowApiKeyCountByProjectId.get(apiKey.projectId) ?? 0) + 1,
		);
		apiKeyCountByProjectId.set(
			apiKey.projectId,
			(apiKeyCountByProjectId.get(apiKey.projectId) ?? 0) + 1,
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

	const attachedWorkflowKeyCountByWorkflowId = new Map<string, number>();
	for (const apiKey of workflowKeyRows) {
		if (!apiKey.agentGraphId) {
			continue;
		}

		attachedWorkflowKeyCountByWorkflowId.set(
			apiKey.agentGraphId,
			(attachedWorkflowKeyCountByWorkflowId.get(apiKey.agentGraphId) ?? 0) + 1,
		);
	}

	return {
		auth,
		organizations: organizationOptions,
		organization,
		projects: projectRows.map((project) => ({
			...project,
			archivedAt: project.archivedAt?.toISOString() ?? null,
			workflowApiKeyCount: workflowApiKeyCountByProjectId.get(project.id) ?? 0,
			apiKeyCount: apiKeyCountByProjectId.get(project.id) ?? 0,
			serviceApiKeyCount: serviceApiKeyCountByProjectId.get(project.id) ?? 0,
		})),
		workflowApiKeys: workflowKeyRows.map((apiKey) => ({
			id: apiKey.id,
			kind: "workflow" as const,
			projectId: apiKey.projectId,
			agentGraphId: apiKey.agentGraphId ?? "",
			workflowName: apiKey.agentGraphs?.name ?? null,
			workflowArchivedAt: apiKey.agentGraphs?.archivedAt?.toISOString() ?? null,
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
		serviceApiKeys: serviceKeyRows.map((apiKey) => ({
			id: apiKey.id,
			kind: "service" as const,
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
				archivedAt: workflow.archivedAt?.toISOString() ?? null,
				entryNode: workflow.entryNode,
				edgeCount: workflow.agentGraphEdges.length,
				attachedWorkflowKeyCount:
					attachedWorkflowKeyCountByWorkflowId.get(workflow.id) ?? 0,
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
						archivedAt: template.archivedAt?.toISOString() ?? null,
						snapshot,
						visibility: template.visibility,
						canEdit: template.organizationId === organizationId,
						startedWorkflowCount: template.agentGraphs.length,
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
