import { z } from "zod";
import { generatedApiKeySchema, workflowDraftSchema } from "./dashboard-inputs";

export const idResponseSchema = z.object({
	id: z.string().min(1),
});

export const organizationSummarySchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	slug: z.string().min(1),
});

export const projectSummarySchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	slug: z.string().min(1),
});

export const workflowApiKeyResponseSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	agentGraphId: z.string().min(1),
});

export const archiveStateResponseSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	archivedAt: z.string().nullable(),
});

export const apiKeyUpdateResponseSchema = z.object({
	id: z.string().min(1),
	enabled: z.boolean(),
	name: z.string().nullable(),
});

export const generatedApiKeyResponseSchema = generatedApiKeySchema;
export const generatedWorkflowApiKeyResponseSchema = generatedApiKeySchema;
export const generatedServiceApiKeyResponseSchema = generatedApiKeySchema;

export const workflowTemplateCreatedResponseSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	version: z.number().int().positive(),
});

export const workflowTemplateUpdatedResponseSchema = z.object({
	id: z.string().min(1),
	version: z.number().int().positive(),
});

export const workflowFromTemplateResponseSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
});

export const generatedWorkflowDraftResponseSchema = z.object({
	draft: workflowDraftSchema,
});
