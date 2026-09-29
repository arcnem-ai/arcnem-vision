import { Effect } from "effect";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { HonoServerContext } from "@/types/serverContext";
import type { UploadRejected } from "./acknowledge";
import type { DocumentUploadErrorPayload } from "./errors.types";
import {
	type DatabaseFailed,
	type ObjectNotFound,
	type StorageFailed,
	type UploadDatabase,
	type UploadEvents,
	type UploadStorage,
	uploadServicesLayer,
} from "./services";

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
		console.warn(fallbackMessage, {
			status: error.status,
			payload: error.payload,
			path: c.req.path,
			method: c.req.method,
		});
		return c.json(error.payload, error.status);
	}

	console.error(fallbackMessage, error);
	return c.json({ message: fallbackMessage }, 500);
};

// Every way an acknowledgement can fail after its request is accepted.
export type AcknowledgementFailure =
	| ObjectNotFound
	| UploadRejected
	| StorageFailed
	| DatabaseFailed;

function acknowledgementFailureResponse(
	c: Context<HonoServerContext>,
	failure: AcknowledgementFailure,
) {
	switch (failure._tag) {
		case "ObjectNotFound":
			return c.json({ message: "Uploaded object not found in storage" }, 404);
		case "UploadRejected":
			return c.json(
				{
					message: failure.message,
					...(failure.maxSizeBytes === undefined
						? {}
						: { maxSizeBytes: failure.maxSizeBytes }),
				},
				failure.status,
			);
		case "StorageFailed":
			console.error("Storage failed during upload acknowledgement", {
				operation: failure.operation,
				objectKey: failure.objectKey,
				error: failure.cause,
			});
			return c.json({ message: "Storage is unavailable. Please retry." }, 502);
		case "DatabaseFailed":
			console.error("Database failed during upload acknowledgement", {
				operation: failure.operation,
				error: failure.cause,
			});
			return c.json({ message: "Failed to acknowledge upload" }, 500);
		default:
			return failure satisfies never;
	}
}

// Runs an acknowledgement with the request's clients and turns its result or
// failure into the response. Unexpected defects reject and reach the route's
// own error handling.
export function respondWithAcknowledgement<A>(
	c: Context<HonoServerContext>,
	acknowledgement: Effect.Effect<
		A,
		AcknowledgementFailure,
		UploadStorage | UploadDatabase | UploadEvents
	>,
	respond: (value: A) => Response | Promise<Response> = (value) =>
		c.json(value),
) {
	return Effect.runPromise(
		acknowledgement.pipe(
			Effect.matchEffect({
				onSuccess: (value) => Effect.promise(async () => respond(value)),
				onFailure: (failure) =>
					Effect.succeed(acknowledgementFailureResponse(c, failure)),
			}),
			Effect.provide(
				uploadServicesLayer({
					s3Client: c.get("s3Client"),
					dbClient: c.get("dbClient"),
					inngestClient: c.get("inngestClient"),
				}),
			),
		),
	);
}
