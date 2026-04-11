import { z } from "zod";
import { jsonValueSchema } from "./json";

export const runItemSchema = z.object({
	id: z.string().min(1),
	agentGraphId: z.string().min(1),
	workflowName: z.string().min(1),
	status: z.string().min(1),
	error: z.string().nullable(),
	startedAt: z.string().min(1),
	finishedAt: z.string().nullable(),
});

export type RunItem = z.infer<typeof runItemSchema>;

export const runStepSchema = z.object({
	id: z.string().min(1),
	nodeKey: z.string().min(1),
	stepOrder: z.number().int(),
	stateDelta: jsonValueSchema,
	startedAt: z.string().min(1),
	finishedAt: z.string().nullable(),
});

export type RunStep = z.infer<typeof runStepSchema>;

export const runsResponseSchema = z.object({
	runs: z.array(runItemSchema),
	nextCursor: z.string().nullable(),
});

export type RunsResponse = z.infer<typeof runsResponseSchema>;

export const runStepsResponseSchema = z.object({
	steps: z.array(runStepSchema),
	initialState: jsonValueSchema.nullable(),
	finalState: jsonValueSchema.nullable(),
	error: z.string().nullable(),
});

export type RunStepsResponse = z.infer<typeof runStepsResponseSchema>;

export const getRunsQuerySchema = z.object({
	organizationId: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).optional(),
});

export type GetRunsQuery = z.infer<typeof getRunsQuerySchema>;
