import { z } from "zod";

export const searchDocumentsToolInputSchema = z.object({
	query: z.string().min(1).describe("The user question or search phrase."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(8)
		.default(5)
		.describe(
			"Maximum number of matching documents to retrieve. Always provide a value and use 5 unless the user explicitly asks for a different breadth.",
		),
});

export const browseDocumentsToolInputSchema = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(8)
		.default(5)
		.describe(
			"Maximum number of recent documents to browse. Always provide a value and use 5 unless broader coverage is needed.",
		),
});
