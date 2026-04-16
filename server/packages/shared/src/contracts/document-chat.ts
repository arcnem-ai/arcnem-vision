import { z } from "zod";

export const chatScopeSchema = z.object({
	kind: z.literal("organization"),
	organizationId: z.string().min(1),
	projectIds: z.array(z.string().min(1)).optional(),
	apiKeyIds: z.array(z.string().min(1)).optional(),
	documentIds: z.array(z.string().min(1)).optional(),
});

export type ChatScope = z.infer<typeof chatScopeSchema>;

export const documentChatCitationSchema = z.object({
	documentId: z.string().min(1),
	projectId: z.string().min(1),
	projectName: z.string().min(1),
	apiKeyId: z.string().min(1).nullable().optional(),
	apiKeyName: z.string().min(1).nullable().optional(),
	label: z.string().min(1),
	excerpt: z.string().min(1),
	matchReason: z.string().min(1),
});

export type DocumentChatCitation = z.infer<typeof documentChatCitationSchema>;

export const documentSearchMatchSchema = z.object({
	documentId: z.string().min(1),
	projectId: z.string().min(1),
	projectName: z.string().min(1),
	apiKeyId: z.string().min(1).nullable().optional(),
	apiKeyName: z.string().min(1).nullable().optional(),
	label: z.string().min(1),
	snippet: z.string().min(1),
	matchReason: z.string().min(1),
	score: z.number(),
	citation: documentChatCitationSchema,
});

export type DocumentSearchMatch = z.infer<typeof documentSearchMatchSchema>;

export const searchDocumentsInScopeOutputSchema = z.object({
	matches: z.array(documentSearchMatchSchema),
});

export type SearchDocumentsInScopeOutput = z.infer<
	typeof searchDocumentsInScopeOutputSchema
>;

export const documentOCRExcerptSchema = z.object({
	modelLabel: z.string().min(1),
	excerpt: z.string().min(1),
	createdAt: z.string().min(1),
});

export const documentSegmentationExcerptSchema = z.object({
	segmentationId: z.string().min(1),
	modelLabel: z.string().min(1),
	prompt: z.string().optional(),
	excerpt: z.string().min(1),
	createdAt: z.string().min(1),
});

export const documentContextItemSchema = z.object({
	documentId: z.string().min(1),
	projectId: z.string().min(1),
	projectName: z.string().min(1),
	apiKeyId: z.string().min(1).nullable().optional(),
	apiKeyName: z.string().min(1).nullable().optional(),
	label: z.string().min(1),
	description: z.string().optional(),
	ocrExcerpts: z.array(documentOCRExcerptSchema).default([]),
	segmentationExcerpts: z.array(documentSegmentationExcerptSchema).default([]),
	citation: documentChatCitationSchema,
});

export type DocumentContextItem = z.infer<typeof documentContextItemSchema>;

export const readDocumentContextOutputSchema = z.object({
	documents: z.array(documentContextItemSchema),
});

export type ReadDocumentContextOutput = z.infer<
	typeof readDocumentContextOutputSchema
>;

export const collectionSearcherResponseSchema = z.object({
	querySummary: z.string().min(1),
	documents: z
		.array(
			z.object({
				documentId: z.string().min(1),
				label: z.string().min(1),
				projectName: z.string().min(1),
				apiKeyName: z
					.string()
					.nullable()
					.describe("API key name when present, otherwise null."),
				matchReason: z.string().min(1),
				snippet: z.string().min(1),
				keyFacts: z.array(z.string().min(1)).max(5),
			}),
		)
		.max(6),
});

export type CollectionSearcherResponse = z.infer<
	typeof collectionSearcherResponseSchema
>;

const modelMessagePartSchema = z.union([
	z.object({
		type: z.literal("text"),
		content: z.string(),
	}),
	z
		.object({
			type: z.string(),
		})
		.passthrough(),
]);

const uiMessagePartSchema = z.union([
	z.object({
		type: z.literal("text"),
		content: z.string(),
	}),
	z.object({
		type: z.literal("thinking"),
		content: z.string(),
	}),
	z
		.object({
			type: z.literal("tool-call"),
			id: z.string().min(1),
			name: z.string().min(1),
		})
		.passthrough(),
	z
		.object({
			type: z.literal("tool-result"),
			toolCallId: z.string().min(1),
			content: z.string(),
		})
		.passthrough(),
	z
		.object({
			type: z.string(),
		})
		.passthrough(),
]);

const documentChatModelMessageSchema = z
	.object({
		id: z.string().optional(),
		role: z.enum(["user", "assistant", "tool", "system"]),
		content: z.union([z.string(), z.array(modelMessagePartSchema)]),
		name: z.string().optional(),
		toolCalls: z.array(z.unknown()).optional(),
		toolCallId: z.string().optional(),
	})
	.passthrough();

const documentChatUIMessageSchema = z
	.object({
		id: z.string().min(1),
		role: z.enum(["user", "assistant", "system"]),
		parts: z.array(uiMessagePartSchema),
		createdAt: z.union([z.string(), z.number(), z.date()]).optional(),
	})
	.passthrough();

export const documentChatMessageSchema = z.union([
	documentChatModelMessageSchema,
	documentChatUIMessageSchema,
]);

export type DocumentChatMessage = z.infer<typeof documentChatMessageSchema>;

export const documentChatRequestSchema = z.object({
	messages: z.array(documentChatMessageSchema).min(1),
	data: z
		.object({
			conversationId: z.string().min(1).optional(),
			scope: chatScopeSchema.optional(),
		})
		.optional(),
	conversationId: z.string().min(1).optional(),
	scope: chatScopeSchema.optional(),
});

export type DocumentChatRequest = z.infer<typeof documentChatRequestSchema>;

export const assistantSourcesEventSchema = z.object({
	messageId: z.string().min(1),
	citations: z.array(documentChatCitationSchema),
});

export type AssistantSourcesEvent = z.infer<typeof assistantSourcesEventSchema>;
