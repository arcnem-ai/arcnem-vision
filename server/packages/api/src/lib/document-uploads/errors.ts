import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { HonoServerContext } from "@/types/serverContext";
import type { DocumentUploadErrorPayload } from "./errors.types";

class DocumentUploadError extends Error {
	constructor(
		readonly status: ContentfulStatusCode,
		readonly payload: DocumentUploadErrorPayload,
	) {
		super(payload.message);
	}
}

export const fail = (
	status: ContentfulStatusCode,
	message: string,
	extra: Omit<DocumentUploadErrorPayload, "message"> = {},
): never => {
	throw new DocumentUploadError(status, {
		message,
		...extra,
	});
};

export const toDocumentUploadErrorResponse = (
	c: Context<HonoServerContext>,
	error: unknown,
	fallbackMessage: string,
) => {
	if (error instanceof DocumentUploadError) {
		return c.json(error.payload, error.status);
	}

	console.error(fallbackMessage, error);
	return c.json({ message: fallbackMessage }, 500);
};
