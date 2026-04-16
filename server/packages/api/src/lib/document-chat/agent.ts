import type { ChatScope, DocumentChatCitation } from "@arcnem-vision/shared";
import {
	collectionSearcherResponseSchema,
	readDocumentContextOutputSchema,
	searchDocumentsInScopeOutputSchema,
} from "@arcnem-vision/shared";
import { ChatOpenAI } from "@langchain/openai";
import {
	createPatchToolCallsMiddleware,
	createSubAgentMiddleware,
	type SubAgent,
} from "deepagents";
import { createAgent, type ToolRuntime, tool } from "langchain";
import { z } from "zod";
import { getApiMcpClient } from "@/clients/apiMcpClient";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import {
	browseDocumentsToolInputSchema,
	searchDocumentsToolInputSchema,
} from "./schemas";

type CitationSink = {
	citations: DocumentChatCitation[];
};

type DocumentChatRuntimeContext = {
	organizationId: string;
	userId: string;
	scope: ChatScope;
	citationSink: CitationSink;
};

const runtimeContextSchema = z.object({
	organizationId: z.string().min(1),
	userId: z.string().min(1),
	scope: z.any(),
	citationSink: z.any(),
});

function toMcpScope(scope: ChatScope) {
	return {
		organization_id: scope.organizationId,
		project_ids: scope.projectIds,
		api_key_ids: scope.apiKeyIds,
		document_ids: scope.documentIds,
	};
}

const browseDocumentsTool = tool(
	async (
		input: z.infer<typeof browseDocumentsToolInputSchema>,
		runtime: ToolRuntime<Record<string, never>, DocumentChatRuntimeContext>,
	) => {
		const response = await getApiMcpClient().callTool(
			"browse_documents_in_scope",
			{
				limit: input.limit,
				scope: toMcpScope(runtime.context.scope),
			},
		);
		const parsed = searchDocumentsInScopeOutputSchema.parse(response);
		runtime.context.citationSink.citations.push(
			...parsed.matches.map((match) => match.citation),
		);
		return parsed;
	},
	{
		name: "browse_documents_in_scope",
		description:
			"Browse recent top-level documents in the current authenticated collection. Use this for recent themes, overviews, patterns, or other open-ended questions.",
		schema: browseDocumentsToolInputSchema,
	},
);

const searchDocumentsTool = tool(
	async (
		input: z.infer<typeof searchDocumentsToolInputSchema>,
		runtime: ToolRuntime<Record<string, never>, DocumentChatRuntimeContext>,
	) => {
		const response = await getApiMcpClient().callTool(
			"search_documents_in_scope",
			{
				query: input.query,
				limit: input.limit,
				scope: toMcpScope(runtime.context.scope),
			},
		);
		const parsed = searchDocumentsInScopeOutputSchema.parse(response);
		runtime.context.citationSink.citations.push(
			...parsed.matches.map((match) => match.citation),
		);
		return parsed;
	},
	{
		name: "search_documents_in_scope",
		description:
			"Search the current authenticated document collection for the user's query. Use this first to find relevant top-level documents.",
		schema: searchDocumentsToolInputSchema,
	},
);

const readDocumentContextTool = tool(
	async (
		input: { documentIds: string[] },
		runtime: ToolRuntime<Record<string, never>, DocumentChatRuntimeContext>,
	) => {
		const response = await getApiMcpClient().callTool("read_document_context", {
			document_ids: input.documentIds,
			scope: toMcpScope(runtime.context.scope),
		});
		const parsed = readDocumentContextOutputSchema.parse(response);
		runtime.context.citationSink.citations.push(
			...parsed.documents.map((document) => document.citation),
		);
		return parsed;
	},
	{
		name: "read_document_context",
		description:
			"Read grounded context for specific top-level documents, including metadata, OCR excerpts, and related segmentation excerpts.",
		schema: z.object({
			documentIds: z
				.array(z.string().min(1))
				.min(1)
				.max(6)
				.describe(
					"Top-level document IDs returned by search_documents_in_scope.",
				),
		}),
	},
);

const collectionSearcherSubagent: SubAgent = {
	name: "collection_searcher",
	description:
		"Searches the authenticated document collection and returns a concise evidence bundle for the parent agent.",
	systemPrompt: [
		"You are a retrieval specialist for a dashboard document collection.",
		"Always ground your work in the available tools.",
		"For open-ended questions about recent documents, themes, summaries, patterns, relevance, or what stands out across the collection, start with browse_documents_in_scope.",
		"For targeted questions about specific phrases, entities, topics, or document types, start with search_documents_in_scope.",
		"After browsing or searching, use read_document_context on the best candidate documents before finalizing your result.",
		"When calling search_documents_in_scope, always include a numeric limit. Use 5 unless the user clearly asks for broader or narrower coverage.",
		"When calling browse_documents_in_scope, always include a numeric limit. Use 5 unless the user clearly asks for broader or narrower coverage.",
		"In your structured response, always include apiKeyName. Use null when an API key name is unavailable.",
		"Return concise evidence, not polished end-user prose.",
		"Keep the result compact and focus on the strongest 3 to 6 documents.",
	].join("\n"),
	tools: [browseDocumentsTool, searchDocumentsTool, readDocumentContextTool],
	responseFormat: collectionSearcherResponseSchema,
};

let cachedAgent: ReturnType<typeof buildDocumentChatAgent> | undefined;

export function getDocumentChatAgent() {
	cachedAgent ??= buildDocumentChatAgent();
	return cachedAgent;
}

export function createCitationSink(): CitationSink {
	return { citations: [] };
}

function buildDocumentChatAgent() {
	const model = new ChatOpenAI({
		apiKey: getAPIEnvVar(API_ENV_VAR.OPENAI_API_KEY),
		model: getAPIEnvVar(API_ENV_VAR.OPENAI_MODEL),
		temperature: 0.1,
	});

	return createAgent({
		name: "document_collection_chat",
		model,
		contextSchema: runtimeContextSchema,
		systemPrompt: [
			"You are the document collection assistant for the dashboard.",
			"Answer questions about the authenticated document collection clearly and concisely.",
			"For any question that depends on document contents, OCR, descriptions, recency, or collection patterns, use the task tool with the collection_searcher subagent before answering.",
			"Do not mention internal tools, MCP, or subagents in the final answer.",
			"Stay grounded in the retrieved evidence. If the evidence is insufficient, say what you could not verify.",
		].join("\n"),
		middleware: [
			createSubAgentMiddleware({
				defaultModel: model,
				defaultTools: [],
				defaultMiddleware: [createPatchToolCallsMiddleware()],
				subagents: [collectionSearcherSubagent],
				generalPurposeAgent: false,
			}),
			createPatchToolCallsMiddleware(),
		],
	});
}
