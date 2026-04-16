import { describe, expect, test } from "bun:test";
import {
	collectionSearcherResponseSchema,
	documentChatRequestSchema,
} from "@arcnem-vision/shared";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import {
	chunkAssistantText,
	dedupeCitations,
	extractLastAssistantText,
	toAgentMessages,
} from "./helpers";
import { searchDocumentsToolInputSchema } from "./schemas";

function readMessageContent(message: unknown) {
	if (
		message &&
		typeof message === "object" &&
		"content" in message &&
		typeof message.content === "string"
	) {
		return message.content;
	}

	return null;
}

describe("extractLastAssistantText", () => {
	test("returns the newest assistant message text from mixed message shapes", () => {
		const text = extractLastAssistantText([
			{ role: "user", content: "hello" },
			{
				type: "ai",
				content: [
					{ text: "The first answer." },
					{ type: "text", content: "This should still work." },
				],
			},
			{
				role: "assistant",
				content: [
					{ type: "text", content: "Latest grounded answer." },
					{ type: "image", url: "ignored" },
				],
			},
		]);

		expect(text).toBe("Latest grounded answer.");
	});
});

describe("chunkAssistantText", () => {
	test("splits long text into readable streaming chunks", () => {
		const chunks = chunkAssistantText(
			"This answer is intentionally a little longer so we can verify that the assistant text is broken into multiple chunks instead of streaming as one giant block.",
		);

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.join("")).toContain("assistant text is broken");
	});
});

describe("dedupeCitations", () => {
	test("keeps one citation per document and prefers the richer excerpt", () => {
		const citations = dedupeCitations([
			{
				documentId: "doc-1",
				projectId: "project-1",
				projectName: "Project One",
				label: "manual.png",
				excerpt: "Short excerpt",
				matchReason: "description",
			},
			{
				documentId: "doc-1",
				projectId: "project-1",
				projectName: "Project One",
				label: "manual.png",
				excerpt:
					"Longer and more useful excerpt that should win when citations are deduplicated.",
				matchReason: "OCR text",
			},
			{
				documentId: "doc-2",
				projectId: "project-1",
				projectName: "Project One",
				label: "diagram.png",
				excerpt: "Separate document excerpt",
				matchReason: "metadata",
			},
		]);

		expect(citations).toHaveLength(2);
		expect(citations[0]?.excerpt).toContain("Longer and more useful");
		expect(citations[1]?.documentId).toBe("doc-2");
	});
});

describe("document chat payloads", () => {
	test("accepts TanStack UI messages with parts", () => {
		const parsed = documentChatRequestSchema.safeParse({
			messages: [
				{
					id: "user-1",
					role: "user",
					parts: [{ type: "text", content: "What is in this document?" }],
				},
			],
			data: {
				scope: {
					kind: "organization",
					organizationId: "org-1",
				},
			},
		});

		expect(parsed.success).toBe(true);
	});

	test("converts TanStack UI messages into agent messages", () => {
		const messages = toAgentMessages([
			{
				id: "user-1",
				role: "user",
				parts: [{ type: "text", content: "Find the serial number." }],
			},
			{
				id: "assistant-1",
				role: "assistant",
				parts: [
					{ type: "text", content: "Looking through the documents now." },
				],
			},
		]);

		expect(messages).toHaveLength(2);
		expect(readMessageContent(messages[0])).toBe("Find the serial number.");
		expect(readMessageContent(messages[1])).toBe(
			"Looking through the documents now.",
		);
	});
});

describe("OpenAI schema compatibility", () => {
	test("marks search tool limit as required in emitted JSON schema", () => {
		const schema = toJsonSchema(searchDocumentsToolInputSchema) as {
			required?: string[];
		};
		const required = Array.isArray(schema.required) ? schema.required : [];

		expect(required).toEqual(["query", "limit"]);
	});

	test("marks subagent response fields as required when nullable", () => {
		const schema = toJsonSchema(collectionSearcherResponseSchema) as {
			properties?: Record<string, unknown>;
		};
		const documentsSchema = schema.properties?.documents as
			| { items?: unknown }
			| undefined;
		const documentItemSchema = (
			documentsSchema &&
			typeof documentsSchema === "object" &&
			"items" in documentsSchema
				? documentsSchema.items
				: undefined
		) as { required?: string[] } | undefined;
		const required =
			documentItemSchema && Array.isArray(documentItemSchema.required)
				? documentItemSchema.required
				: [];

		expect(required).toContain("apiKeyName");
	});
});
