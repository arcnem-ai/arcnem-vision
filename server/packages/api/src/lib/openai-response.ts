// LangChain exposes Responses status and raw output in response_metadata.
// The model refused the request, as opposed to failing to answer it.
export class OpenAIRefusalError extends Error {
	constructor() {
		super("OpenAI declined this request.");
		this.name = "OpenAIRefusalError";
	}
}

export function assertOpenAIResponseComplete(
	message:
		| {
				response_metadata?: Record<string, unknown>;
		  }
		| undefined,
) {
	const metadata = message?.response_metadata;
	if (metadata?.error || metadata?.status !== "completed") {
		throw new Error("OpenAI did not complete the response. Please retry.");
	}
	const output = metadata?.output;
	if (
		Array.isArray(output) &&
		output.some(
			(item) =>
				Array.isArray(item?.content) &&
				item.content.some((part: { type?: string }) => part.type === "refusal"),
		)
	) {
		throw new OpenAIRefusalError();
	}
}
