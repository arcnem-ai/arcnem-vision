import { z } from "zod";

export const generatedMappingEntrySchema = z.object({
	field: z.string().min(1),
	value: z.string().min(1),
});

export const generatedInputParamEntrySchema = z.object({
	field: z.string().min(1),
	valueKind: z.enum(["string", "number", "boolean", "state_key"]),
	value: z.string(),
});

export const generatedWorkflowNodeSchema = z.object({
	nodeKey: z.string().min(1),
	nodeType: z.enum(["worker", "supervisor", "condition", "tool"]),
	inputKey: z.string().default(""),
	outputKey: z.string().default(""),
	model: z.string().default(""),
	tools: z.array(z.string()).default([]),
	systemMessage: z.string().default(""),
	maxIterations: z.number().int().min(0).max(100).default(0),
	inputMode: z.enum(["", "image_url"]).default(""),
	inputPrompt: z.string().default(""),
	members: z.array(z.string()).default([]),
	finishTarget: z.string().default(""),
	sourceKey: z.string().default(""),
	operator: z.enum(["", "contains", "equals"]).default(""),
	value: z.string().default(""),
	caseSensitive: z.boolean().default(false),
	trueTarget: z.string().default(""),
	falseTarget: z.string().default(""),
	inputMappingEntries: z.array(generatedMappingEntrySchema).default([]),
	inputParamEntries: z.array(generatedInputParamEntrySchema).default([]),
	outputMappingEntries: z.array(generatedMappingEntrySchema).default([]),
});

export const generatedWorkflowPlanSchema = z.object({
	impossibleReason: z.string().default(""),
	name: z.string().min(1),
	description: z.string().default(""),
	entryNode: z.string().min(1),
	nodes: z.array(generatedWorkflowNodeSchema).min(1),
	edges: z
		.array(
			z.object({
				fromNode: z.string().min(1),
				toNode: z.string().min(1),
			}),
		)
		.default([]),
});

export type GeneratedWorkflowNode = z.infer<typeof generatedWorkflowNodeSchema>;
export type GeneratedWorkflowPlan = z.infer<typeof generatedWorkflowPlanSchema>;
