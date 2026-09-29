import type { PGDB } from "@arcnem-vision/db/server";
import type { S3Client } from "bun";
import { Context, Data, type Duration, Effect, Layer } from "effect";
import type { Inngest } from "inngest";

// The outside systems an upload acknowledgement talks to. Routes supply the
// live clients from the Hono context; tests supply small substitutes.

export type StoredObjectStats = {
	size: number;
	lastModified: Date;
	etag: string;
	type: string;
};

export class ObjectNotFound extends Data.TaggedError("ObjectNotFound")<{
	objectKey: string;
}> {}

export class StorageFailed extends Data.TaggedError("StorageFailed")<{
	operation: "stat" | "delete";
	objectKey: string;
	cause: unknown;
}> {}

export class DatabaseFailed extends Data.TaggedError("DatabaseFailed")<{
	operation: string;
	cause: unknown;
}> {}

export class EnqueueFailed extends Data.TaggedError("EnqueueFailed")<{
	eventId: string;
	cause: unknown;
}> {}

export type UploadEvent = {
	id: string;
	name: string;
	data: Record<string, unknown>;
};

// Bun's S3 calls have no timeout of their own, so a stalled storage endpoint
// would hold the request open indefinitely.
export const STORAGE_TIMEOUT = "10 seconds";

const withStorageTimeout =
	(operation: "stat" | "delete", objectKey: string, timeout: Duration.Input) =>
	<A, E>(effect: Effect.Effect<A, E>) =>
		Effect.timeoutOrElse(effect, {
			duration: timeout,
			orElse: () =>
				Effect.fail(
					new StorageFailed({
						operation,
						objectKey,
						cause: new Error(
							`Storage ${operation} timed out after ${STORAGE_TIMEOUT}`,
						),
					}),
				),
		});

export class UploadStorage extends Context.Service<
	UploadStorage,
	{
		stat(
			objectKey: string,
		): Effect.Effect<StoredObjectStats, ObjectNotFound | StorageFailed>;
		delete(objectKey: string): Effect.Effect<void, StorageFailed>;
	}
>()("arcnem-vision/api/document-uploads/UploadStorage") {
	static fromClient(
		client: S3Client,
		timeout: Duration.Input = STORAGE_TIMEOUT,
	) {
		return Layer.succeed(
			UploadStorage,
			UploadStorage.of({
				stat: (objectKey) =>
					Effect.tryPromise({
						try: () => client.stat(objectKey),
						// Bun reports a missing object as NoSuchKey; any other failure
						// means storage itself could not answer.
						catch: (cause) =>
							(cause as { code?: string } | null)?.code === "NoSuchKey"
								? new ObjectNotFound({ objectKey })
								: new StorageFailed({ operation: "stat", objectKey, cause }),
					}).pipe(withStorageTimeout("stat", objectKey, timeout)),
				delete: (objectKey) =>
					Effect.tryPromise({
						try: () => client.delete(objectKey),
						catch: (cause) =>
							new StorageFailed({ operation: "delete", objectKey, cause }),
					}).pipe(withStorageTimeout("delete", objectKey, timeout)),
			}),
		);
	}
}

export class UploadDatabase extends Context.Service<UploadDatabase, PGDB>()(
	"arcnem-vision/api/document-uploads/UploadDatabase",
) {}

// Runs one database call, reporting its failure as DatabaseFailed.
export const queryDatabase = <A>(
	operation: string,
	run: (db: PGDB) => Promise<A>,
) =>
	Effect.gen(function* () {
		const db = yield* UploadDatabase;
		return yield* Effect.tryPromise({
			try: () => run(db),
			catch: (cause) => new DatabaseFailed({ operation, cause }),
		});
	});

export class UploadEvents extends Context.Service<
	UploadEvents,
	{ send(event: UploadEvent): Effect.Effect<void, EnqueueFailed> }
>()("arcnem-vision/api/document-uploads/UploadEvents") {
	static fromInngest(client: Inngest) {
		return Layer.succeed(
			UploadEvents,
			UploadEvents.of({
				send: (event) =>
					Effect.tryPromise({
						try: () => client.send(event),
						catch: (cause) => new EnqueueFailed({ eventId: event.id, cause }),
					}).pipe(Effect.asVoid),
			}),
		);
	}
}

export const uploadServicesLayer = (clients: {
	s3Client: S3Client;
	dbClient: PGDB;
	inngestClient: Inngest;
}) =>
	Layer.mergeAll(
		UploadStorage.fromClient(clients.s3Client),
		Layer.succeed(UploadDatabase, clients.dbClient),
		UploadEvents.fromInngest(clients.inngestClient),
	);
