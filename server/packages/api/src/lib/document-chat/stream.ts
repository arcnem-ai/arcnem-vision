import type { ChatScope } from "@arcnem-vision/shared";
import type { BaseMessageLike } from "@langchain/core/messages";
import type { StreamChunk } from "@tanstack/ai";
import { createCitationSink, getDocumentChatAgent } from "./agent";
import {
	chunkAssistantText,
	dedupeCitations,
	extractLastAssistantText,
} from "./helpers";

type DocumentChatStreamOptions = {
	messages: BaseMessageLike[];
	conversationId: string;
	organizationId: string;
	userId: string;
	scope: ChatScope;
};

const HEARTBEAT_INTERVAL_MS = 5_000;

export function createDocumentChatResponse(options: DocumentChatStreamOptions) {
	const encoder = new TextEncoder();
	let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	let closed = false;
	const stopHeartbeat = () => {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			heartbeatTimer = setInterval(() => {
				if (!closed) {
					controller.enqueue(encoder.encode(": ping\n\n"));
				}
			}, HEARTBEAT_INTERVAL_MS);

			const writeChunk = (chunk: StreamChunk) => {
				if (!closed) {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
					);
				}
			};

			void (async () => {
				try {
					for await (const chunk of streamDocumentChatResponse(options)) {
						writeChunk(chunk);
					}
				} catch (error) {
					writeChunk({
						type: "RUN_ERROR",
						runId: options.conversationId,
						error: {
							message:
								error instanceof Error
									? error.message
									: "Document chat failed unexpectedly.",
						},
						timestamp: Date.now(),
					});
				} finally {
					closed = true;
					stopHeartbeat();
					try {
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
					} catch {
						// stream already cancelled
					}
					try {
						controller.close();
					} catch {
						// stream already closed
					}
				}
			})();
		},
		cancel() {
			closed = true;
			stopHeartbeat();
		},
	});

	return new Response(stream, {
		headers: {
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"Content-Type": "text/event-stream",
		},
	});
}

async function* streamDocumentChatResponse(
	options: DocumentChatStreamOptions,
): AsyncGenerator<StreamChunk> {
	const runId = options.conversationId;
	const messageId = `assistant-${crypto.randomUUID()}`;
	const timestamp = () => Date.now();

	yield {
		type: "RUN_STARTED",
		runId,
		threadId: options.conversationId,
		timestamp: timestamp(),
	};

	try {
		const agent = getDocumentChatAgent();
		const citationSink = createCitationSink();
		const result = await agent.invoke(
			{ messages: options.messages },
			{
				context: {
					organizationId: options.organizationId,
					userId: options.userId,
					scope: options.scope,
					citationSink,
				},
				configurable: {
					thread_id: options.conversationId,
					run_id: runId,
				},
			},
		);

		const answer =
			extractLastAssistantText(result.messages) ||
			"I couldn't find enough grounded information in the current document collection to answer that confidently yet.";
		const citations = dedupeCitations(citationSink.citations).slice(0, 8);

		yield {
			type: "TEXT_MESSAGE_START",
			messageId,
			role: "assistant",
			timestamp: timestamp(),
		};

		for (const chunk of chunkAssistantText(answer)) {
			yield {
				type: "TEXT_MESSAGE_CONTENT",
				messageId,
				delta: chunk,
				timestamp: timestamp(),
			};
		}

		if (citations.length > 0) {
			yield {
				type: "CUSTOM",
				name: "assistant_sources",
				value: {
					messageId,
					citations,
				},
				timestamp: timestamp(),
			};
		}

		yield {
			type: "TEXT_MESSAGE_END",
			messageId,
			timestamp: timestamp(),
		};
		yield {
			type: "RUN_FINISHED",
			runId,
			finishReason: "stop",
			timestamp: timestamp(),
		};
	} catch (error) {
		yield {
			type: "RUN_ERROR",
			runId,
			error: {
				message:
					error instanceof Error
						? error.message
						: "Document chat failed unexpectedly.",
			},
			timestamp: timestamp(),
		};
	}
}
