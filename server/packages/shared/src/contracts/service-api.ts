import { z } from "zod";
import { workflowSchemaObjectSchema } from "./dashboard-shapes";
import { jsonValueSchema } from "./json";

export const serviceDocumentScopeSchema = z
	.object({
		apiKeyIds: z.array(z.string().min(1)).optional(),
		documentIds: z.array(z.string().min(1)).optional(),
		apiKeyBound: z.boolean().optional(),
	})
	.refine(
		(value) =>
			Boolean(
				(value.apiKeyIds?.length ?? 0) > 0 ||
					(value.documentIds?.length ?? 0) > 0 ||
					typeof value.apiKeyBound === "boolean",
			),
		{
			message: "scope must include apiKeyIds, documentIds, or apiKeyBound",
		},
	)
	.refine(
		(value) =>
			!((value.apiKeyIds?.length ?? 0) > 0 && value.apiKeyBound === false),
		{
			message: "apiKeyIds cannot be combined with apiKeyBound=false",
			path: ["apiKeyIds"],
		},
	);

export type ServiceDocumentScope = z.infer<typeof serviceDocumentScopeSchema>;

export const serviceDocumentListQuerySchema = z
	.object({
		limit: z.number().int().positive().max(100).optional(),
		cursor: z.string().min(1).optional(),
		documentIds: z.array(z.string().min(1)).optional(),
		apiKeyIds: z.array(z.string().min(1)).optional(),
		apiKeyBound: z.boolean().optional(),
	})
	.refine(
		(value) =>
			!((value.apiKeyIds?.length ?? 0) > 0 && value.apiKeyBound === false),
		{
			message: "apiKeyIds cannot be combined with apiKeyBound=false",
			path: ["apiKeyIds"],
		},
	);

export type ServiceDocumentListQuery = z.infer<
	typeof serviceDocumentListQuerySchema
>;

export const serviceUploadPresignRequestSchema = z.object({
	contentType: z.string().min(1),
	size: z.number().int().positive(),
	visibility: z.enum(["private", "org", "public"]).optional(),
});

export type ServiceUploadPresignRequest = z.infer<
	typeof serviceUploadPresignRequestSchema
>;

export const serviceUploadPresignResponseSchema = z.object({
	presignedUploadId: z.string().min(1),
	objectKey: z.string().min(1),
	uploadUrl: z.string().url(),
	contentType: z.string().min(1),
	maxSizeBytes: z.number().int().positive(),
	expiresInSeconds: z.number().int().positive(),
});

export type ServiceUploadPresignResponse = z.infer<
	typeof serviceUploadPresignResponseSchema
>;

export const serviceUploadAcknowledgeRequestSchema = z.object({
	objectKey: z.string().min(1),
});

export type ServiceUploadAcknowledgeRequest = z.infer<
	typeof serviceUploadAcknowledgeRequestSchema
>;

export const serviceUploadAcknowledgeResponseSchema = z.object({
	status: z.literal("verified"),
	documentId: z.string().min(1),
	presignedUploadId: z.string().min(1),
});

export type ServiceUploadAcknowledgeResponse = z.infer<
	typeof serviceUploadAcknowledgeResponseSchema
>;

export const serviceWorkflowExecutionRequestSchema = z
	.object({
		workflowId: z.string().min(1),
		documentIds: z.array(z.string().min(1)).optional(),
		scope: serviceDocumentScopeSchema.optional(),
		initialState: z.record(z.string(), jsonValueSchema).optional(),
	})
	.refine(
		(value) =>
			(value.documentIds?.length ?? 0) > 0 || value.scope !== undefined,
		{
			message: "documentIds or scope is required",
			path: ["documentIds"],
		},
	);

export type ServiceWorkflowExecutionRequest = z.infer<
	typeof serviceWorkflowExecutionRequestSchema
>;

export const serviceWorkflowExecutionAcceptedSchema = z.object({
	executionId: z.string().min(1),
	workflowId: z.string().min(1),
	status: z.literal("running"),
	documentIds: z.array(z.string().min(1)).min(1),
	documentCount: z.number().int().positive(),
});

export type ServiceWorkflowExecutionAccepted = z.infer<
	typeof serviceWorkflowExecutionAcceptedSchema
>;

export const serviceWorkflowExecutionItemSchema = z.object({
	executionId: z.string().min(1),
	workflowId: z.string().min(1),
	status: z.enum(["running", "completed", "failed"]),
	startedAt: z.string().nullable(),
	finishedAt: z.string().nullable(),
	error: z.string().nullable(),
	finalState: jsonValueSchema.nullable(),
});

export type ServiceWorkflowExecutionItem = z.infer<
	typeof serviceWorkflowExecutionItemSchema
>;

export const serviceDocumentVisibilityUpdateSchema = z.object({
	documentIds: z.array(z.string().min(1)).min(1),
	visibility: z.enum(["private", "org", "public"]),
});

export type ServiceDocumentVisibilityUpdate = z.infer<
	typeof serviceDocumentVisibilityUpdateSchema
>;

export const serviceDocumentItemSchema = z.object({
	id: z.string().min(1),
	objectKey: z.string().min(1),
	contentType: z.string().min(1),
	sizeBytes: z.number().int().nonnegative(),
	createdAt: z.string().min(1),
	description: z.string().nullable(),
	visibility: z.enum(["private", "org", "public"]),
	apiKeyId: z.string().nullable(),
	downloadUrl: z.string().url(),
	publicUrl: z.string().nullable(),
});

export type ServiceDocumentItem = z.infer<typeof serviceDocumentItemSchema>;

export const serviceDocumentsResponseSchema = z.object({
	documents: z.array(serviceDocumentItemSchema),
	nextCursor: z.string().nullable(),
});

export type ServiceDocumentsResponse = z.infer<
	typeof serviceDocumentsResponseSchema
>;

export const serviceErrorResponseSchema = z.object({
	message: z.string().min(1),
});

export type ServiceErrorResponse = z.infer<typeof serviceErrorResponseSchema>;

export const serviceDocumentSelectionErrorSchema =
	serviceErrorResponseSchema.extend({
		missingDocumentIds: z.array(z.string().min(1)).optional(),
		maxDocumentCount: z.number().int().positive().optional(),
	});

export type ServiceDocumentSelectionError = z.infer<
	typeof serviceDocumentSelectionErrorSchema
>;

export const serviceWorkflowSummarySchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().nullable(),
	stateSchema: workflowSchemaObjectSchema.nullable(),
	updatedAt: z.string().min(1),
});

export type ServiceWorkflowSummary = z.infer<
	typeof serviceWorkflowSummarySchema
>;

export const serviceWorkflowsResponseSchema = z.object({
	workflows: z.array(serviceWorkflowSummarySchema),
});

export type ServiceWorkflowsResponse = z.infer<
	typeof serviceWorkflowsResponseSchema
>;
