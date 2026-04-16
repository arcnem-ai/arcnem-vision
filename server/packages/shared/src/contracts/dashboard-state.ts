import { z } from "zod";
import {
	serviceApiKeySchema,
	workflowApiKeySchema,
	workflowEdgeSchema,
	workflowModelOptionSchema,
	workflowNodeSampleSchema,
	workflowNodeSchema,
	workflowNodeTypeCountsSchema,
	workflowTemplateSummarySchema,
	workflowToolOptionSchema,
} from "./dashboard-shapes";

export const dashboardDataSchema = z.object({
	auth: z.object({
		state: z.enum(["ready", "missing"]),
		source: z.enum(["cookie", "fallback", "none"]),
		sessionPreview: z.string().nullable(),
		userName: z.string().nullable(),
		userEmail: z.string().nullable(),
		activeOrganizationId: z.string().nullable(),
		signUpEnabled: z.boolean(),
		organizationCreationEnabled: z.boolean(),
		debugSessionBootstrapEnabled: z.boolean(),
	}),
	organizations: z.array(
		z.object({
			id: z.string().min(1),
			name: z.string().min(1),
			slug: z.string().min(1),
			role: z.string().min(1),
		}),
	),
	organization: z
		.object({
			id: z.string().min(1),
			name: z.string().min(1),
			slug: z.string().min(1),
		})
		.nullable(),
	projects: z.array(
		z.object({
			id: z.string().min(1),
			name: z.string().min(1),
			slug: z.string().min(1),
			archivedAt: z.string().nullable(),
			workflowApiKeyCount: z.number().int().nonnegative(),
			apiKeyCount: z.number().int().nonnegative(),
			serviceApiKeyCount: z.number().int().nonnegative(),
		}),
	),
	workflowApiKeys: z.array(workflowApiKeySchema),
	serviceApiKeys: z.array(serviceApiKeySchema),
	workflows: z.array(
		z.object({
			id: z.string().min(1),
			name: z.string().min(1),
			description: z.string().nullable(),
			entryNode: z.string().min(1),
			edgeCount: z.number().int().nonnegative(),
			attachedWorkflowKeyCount: z.number().int().nonnegative(),
			template: z
				.object({
					id: z.string().min(1),
					name: z.string().min(1),
					version: z.number().int().nullable(),
				})
				.nullable(),
			nodeTypeCounts: workflowNodeTypeCountsSchema,
			nodes: z.array(workflowNodeSchema),
			edges: z.array(workflowEdgeSchema),
			nodeSamples: z.array(workflowNodeSampleSchema),
		}),
	),
	workflowTemplates: z.array(workflowTemplateSummarySchema),
	modelCatalog: z.array(workflowModelOptionSchema),
	toolCatalog: z.array(workflowToolOptionSchema),
});

export type DashboardData = z.infer<typeof dashboardDataSchema>;
