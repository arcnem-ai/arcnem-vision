import type {
	DocumentChatCitation,
	DocumentChatMessage,
	DocumentChatRequest,
} from "@arcnem-vision/shared";
import type { BaseMessageLike } from "@langchain/core/messages";
import { AIMessage, HumanMessage, ToolMessage } from "langchain";

function contentToPlainText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((part) => {
			if (typeof part === "string") {
				return part;
			}
			if (!part || typeof part !== "object") {
				return "";
			}
			if ("text" in part && typeof part.text === "string") {
				return part.text;
			}
			if ("content" in part && typeof part.content === "string") {
				return part.content;
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function getMessageContent(message: DocumentChatMessage) {
	if ("parts" in message && Array.isArray(message.parts)) {
		return message.parts;
	}

	return message.content;
}

export function toAgentMessages(
	messages: DocumentChatRequest["messages"],
): BaseMessageLike[] {
	return messages.map((message) => {
		const content = contentToPlainText(getMessageContent(message));
		switch (message.role) {
			case "assistant":
				return new AIMessage({
					content,
					name:
						"name" in message && typeof message.name === "string"
							? message.name
							: undefined,
					tool_calls:
						"toolCalls" in message ? (message.toolCalls as never) : undefined,
				});
			case "tool":
				return new ToolMessage({
					content,
					tool_call_id:
						"toolCallId" in message
							? (message.toolCallId ?? crypto.randomUUID())
							: crypto.randomUUID(),
				});
			case "system":
				return new HumanMessage(content);
			default:
				return new HumanMessage(content);
		}
	});
}

export function extractLastAssistantText(messages: unknown): string {
	if (!Array.isArray(messages)) {
		return "";
	}

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index] as {
			role?: string;
			type?: string;
			content?: unknown;
			parts?: unknown;
			_getType?: () => string;
		};
		const messageType = message?._getType?.() ?? message?.type ?? message?.role;
		if (messageType !== "ai" && messageType !== "assistant") {
			continue;
		}

		return contentToPlainText(message.parts ?? message.content);
	}

	return "";
}

export function chunkAssistantText(text: string): string[] {
	const normalized = text.trim();
	if (!normalized) {
		return [];
	}

	const words = normalized.split(/\s+/);
	const chunks: string[] = [];
	let currentChunk = "";

	for (const word of words) {
		const candidate = currentChunk ? `${currentChunk} ${word}` : word;
		if (candidate.length > 80 && currentChunk) {
			chunks.push(`${currentChunk} `);
			currentChunk = word;
			continue;
		}
		currentChunk = candidate;
	}

	if (currentChunk) {
		chunks.push(currentChunk);
	}

	return chunks;
}

export function dedupeCitations(
	citations: DocumentChatCitation[],
): DocumentChatCitation[] {
	const deduped = new Map<string, DocumentChatCitation>();

	for (const citation of citations) {
		if (!deduped.has(citation.documentId)) {
			deduped.set(citation.documentId, citation);
			continue;
		}

		const current = deduped.get(citation.documentId);
		if (!current) {
			continue;
		}

		if (
			citation.excerpt.length > current.excerpt.length &&
			citation.excerpt.length <= 280
		) {
			deduped.set(citation.documentId, citation);
		}
	}

	return Array.from(deduped.values());
}
