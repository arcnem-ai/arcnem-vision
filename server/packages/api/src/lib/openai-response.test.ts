import { expect, test } from "bun:test";
import { assertOpenAIResponseComplete } from "./openai-response";

test("rejects partial and refused Responses output before consumers use it", () => {
	expect(() =>
		assertOpenAIResponseComplete({
			response_metadata: { status: "completed" },
		}),
	).not.toThrow();
	for (const metadata of [
		{
			status: "incomplete",
			incomplete_details: { reason: "max_output_tokens" },
		},
		{ status: "failed", error: { code: "server_error" } },
		{
			status: "completed",
			output: [
				{
					type: "message",
					content: [{ type: "refusal", refusal: "declined" }],
				},
			],
		},
	]) {
		expect(() =>
			assertOpenAIResponseComplete({ response_metadata: metadata }),
		).toThrow();
	}
});
