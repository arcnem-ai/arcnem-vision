import { z } from "zod";
import {
	workflowNodeConfigSchema,
	workflowTemplateVisibilitySchema,
} from "./dashboard-shapes";

const workflowNodeInputSchema = z.object({
	id: z.string().optional(),
	nodeKey: z.string().min(1),
	nodeType: z.string().min(1),
	x: z.number(),
	y: z.number(),
	inputKey: z.string().nullable().optional(),
	outputKey: z.string().nullable().optional(),
	modelId: z.string().nullable().optional(),
	toolIds: z.array(z.string()).optional(),
	config: workflowNodeConfigSchema.optional(),
});

const workflowEdgeInputSchema = z.object({
	fromNode: z.string().min(1),
	toNode: z.string().min(1),
});

export const workflowDraftSchema = z.object({
	name: z.string().min(1),
	description: z.string(),
	entryNode: z.string().min(1),
	nodes: z.array(workflowNodeInputSchema),
	edges: z.array(workflowEdgeInputSchema),
});

export type WorkflowDraft = z.infer<typeof workflowDraftSchema>;

export const workflowTemplateDraftSchema = workflowDraftSchema.extend({
	visibility: workflowTemplateVisibilitySchema,
});

export type WorkflowTemplateDraft = z.infer<typeof workflowTemplateDraftSchema>;

export const generatedApiKeySchema = z.object({
	id: z.string().min(1),
	name: z.string().nullable(),
	value: z.string().min(1),
	start: z.string().nullable(),
	prefix: z.string().nullable(),
});

export type GeneratedAPIKey = z.infer<typeof generatedApiKeySchema>;

export const generatedWorkflowApiKeySchema = generatedApiKeySchema;

export type GeneratedWorkflowAPIKey = GeneratedAPIKey;

export const generatedServiceApiKeySchema = generatedApiKeySchema;

export type GeneratedServiceAPIKey = GeneratedAPIKey;

export const createProjectInputSchema = z.object({
	name: z.string().min(1),
});

export const createWorkflowApiKeyInputSchema = z.object({
	projectId: z.string().min(1),
	name: z.string().min(1),
	agentGraphId: z.string().min(1),
});

export const updateWorkflowApiKeyInputSchema = z.object({
	apiKeyId: z.string().min(1),
	name: z.string().min(1),
	enabled: z.boolean(),
	agentGraphId: z.string().min(1),
});

export const createServiceApiKeyInputSchema = z.object({
	projectId: z.string().min(1),
	name: z.string().min(1),
});

export const updateServiceApiKeyInputSchema = z.object({
	apiKeyId: z.string().min(1),
	name: z.string().min(1),
	enabled: z.boolean(),
});

export const setProjectArchivedInputSchema = z.object({
	projectId: z.string().min(1),
	archived: z.boolean(),
});

export const createWorkflowInputSchema = workflowDraftSchema;
export const updateWorkflowInputSchema = workflowDraftSchema.extend({
	workflowId: z.string().min(1),
});

export const generateWorkflowDraftInputSchema = z.object({
	workflowDescription: z.string().min(10).max(4000),
});

export const createWorkflowFromTemplateInputSchema = z.object({
	templateId: z.string().min(1),
});

export const createWorkflowTemplateFromWorkflowInputSchema = z.object({
	workflowId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().nullable().optional(),
	visibility: workflowTemplateVisibilitySchema,
});

export const updateWorkflowTemplateInputSchema =
	workflowTemplateDraftSchema.extend({
		templateId: z.string().min(1),
	});

export const createOrganizationInputSchema = z.object({
	name: z.string().min(1),
});

export const switchOrganizationInputSchema = z.object({
	organizationId: z.string().min(1),
});

export const getDashboardStateQuerySchema = z.object({
	includeArchived: z.boolean().optional(),
});
