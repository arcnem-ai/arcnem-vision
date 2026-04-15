import { z } from "zod";
import type { JSONValue } from "./json";
import { jsonValueSchema } from "./json";

export const workflowTemplateVisibilitySchema = z.enum([
	"organization",
	"public",
]);

export type WorkflowTemplateVisibility = z.infer<
	typeof workflowTemplateVisibilitySchema
>;

export const workflowSchemaValueSchema: z.ZodType<
	string | number | boolean | Record<string, JSONValue> | JSONValue[]
> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.record(z.string(), jsonValueSchema),
		z.array(jsonValueSchema),
	]),
);

export const workflowSchemaObjectSchema = z.record(
	z.string(),
	workflowSchemaValueSchema,
);

export type WorkflowSchemaObject = z.infer<typeof workflowSchemaObjectSchema>;

export const workflowToolOptionSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	inputSchema: workflowSchemaObjectSchema,
	outputSchema: workflowSchemaObjectSchema,
	inputFields: z.array(z.string()),
	outputFields: z.array(z.string()),
});

export type WorkflowToolOption = z.infer<typeof workflowToolOptionSchema>;

export const workflowNodeConfigSchema = z.record(z.string(), jsonValueSchema);

export type WorkflowNodeConfig = z.infer<typeof workflowNodeConfigSchema>;

export const workflowNodeSchema = z.object({
	id: z.string().min(1),
	nodeKey: z.string().min(1),
	nodeType: z.string().min(1),
	x: z.number(),
	y: z.number(),
	inputKey: z.string().nullable(),
	outputKey: z.string().nullable(),
	modelId: z.string().nullable(),
	modelLabel: z.string().nullable(),
	toolIds: z.array(z.string()),
	tools: z.array(workflowToolOptionSchema),
	toolNames: z.array(z.string()),
	config: workflowNodeConfigSchema,
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
	id: z.string().min(1),
	fromNode: z.string().min(1),
	toNode: z.string().min(1),
});

export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowNodeTypeCountsSchema = z.object({
	worker: z.number().int().nonnegative(),
	supervisor: z.number().int().nonnegative(),
	condition: z.number().int().nonnegative(),
	tool: z.number().int().nonnegative(),
	other: z.number().int().nonnegative(),
});

export type WorkflowNodeTypeCounts = z.infer<
	typeof workflowNodeTypeCountsSchema
>;

export const workflowNodeSampleSchema = z.object({
	id: z.string().min(1),
	nodeKey: z.string().min(1),
	nodeType: z.string().min(1),
	toolNames: z.array(z.string()),
});

export type WorkflowNodeSample = z.infer<typeof workflowNodeSampleSchema>;

export const workflowTemplateSummarySchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().nullable(),
	version: z.number().int().nonnegative(),
	versionCount: z.number().int().positive(),
	visibility: workflowTemplateVisibilitySchema,
	canEdit: z.boolean(),
	entryNode: z.string().min(1),
	edgeCount: z.number().int().nonnegative(),
	startedWorkflowCount: z.number().int().nonnegative(),
	nodeTypeCounts: workflowNodeTypeCountsSchema,
	nodes: z.array(workflowNodeSchema),
	edges: z.array(workflowEdgeSchema),
	nodeSamples: z.array(workflowNodeSampleSchema),
});

export type WorkflowTemplateSummary = z.infer<
	typeof workflowTemplateSummarySchema
>;

export const managedApiKeySchema = z.object({
	id: z.string().min(1),
	name: z.string().nullable(),
	start: z.string().nullable(),
	prefix: z.string().nullable(),
	enabled: z.boolean(),
	createdAt: z.string().min(1),
	updatedAt: z.string().min(1),
	lastRequest: z.string().nullable(),
	expiresAt: z.string().nullable(),
	requestCount: z.number().int().nonnegative(),
	rateLimitEnabled: z.boolean(),
	rateLimitMax: z.number().int().nonnegative(),
	rateLimitTimeWindow: z.number().int().nonnegative(),
});

export type ManagedAPIKey = z.infer<typeof managedApiKeySchema>;

export const deviceApiKeySchema = managedApiKeySchema;

export type DeviceAPIKey = z.infer<typeof deviceApiKeySchema>;

export const serviceApiKeySchema = managedApiKeySchema.extend({
	projectId: z.string().min(1),
});

export type ServiceAPIKey = z.infer<typeof serviceApiKeySchema>;

export const workflowModelOptionSchema = z.object({
	id: z.string().min(1),
	provider: z.string().min(1),
	name: z.string().min(1),
	type: z.string().nullable(),
	label: z.string().min(1),
});

export type WorkflowModelOption = z.infer<typeof workflowModelOptionSchema>;
