import { describe, expect, spyOn, test } from "bun:test";
import type { S3Client } from "bun";
import { type Duration, Effect, Exit, Layer, Option } from "effect";
import { MAX_UPLOAD_SIZE_BYTES } from "@/constants/uploads";
import { statUploadedObject } from "./acknowledge";
import {
	ObjectNotFound,
	StorageFailed,
	type StoredObjectStats,
	UploadStorage,
} from "./services";

function fakeStorage(
	stat: () => Effect.Effect<StoredObjectStats, ObjectNotFound | StorageFailed>,
	options: { failDelete?: boolean } = {},
) {
	const deleted: string[] = [];
	const layer = Layer.succeed(
		UploadStorage,
		UploadStorage.of({
			stat,
			delete: (objectKey) =>
				options.failDelete
					? Effect.fail(
							new StorageFailed({
								operation: "delete",
								objectKey,
								cause: new Error("delete refused"),
							}),
						)
					: Effect.sync(() => {
							deleted.push(objectKey);
						}),
		}),
	);
	return { layer, deleted };
}

const storedObject =
	(size: number, type = "image/png") =>
	() =>
		Effect.succeed({
			size,
			lastModified: new Date("2026-09-01T00:00:00Z"),
			etag: '"etag"',
			type,
		});

function statWith(
	storage: ReturnType<typeof fakeStorage>,
	objectKey = "uploads/object.png",
) {
	return Effect.runPromiseExit(
		statUploadedObject(objectKey).pipe(Effect.provide(storage.layer)),
	);
}

function failureOf<A, E>(exit: Exit.Exit<A, E>) {
	const error = Exit.findErrorOption(exit);
	if (Option.isNone(error)) throw new Error("Expected a typed failure");
	return error.value;
}

describe("statUploadedObject", () => {
	test("accepts an object at the maximum upload size", async () => {
		const storage = fakeStorage(storedObject(MAX_UPLOAD_SIZE_BYTES));

		const exit = await statWith(storage);

		expect(Exit.isSuccess(exit) && exit.value.size).toBe(MAX_UPLOAD_SIZE_BYTES);
		expect(storage.deleted).toEqual([]);
	});

	test("rejects and deletes an object larger than the declared limit", async () => {
		const storage = fakeStorage(storedObject(MAX_UPLOAD_SIZE_BYTES + 1));

		const failure = failureOf(await statWith(storage, "uploads/oversized.png"));

		expect(failure).toMatchObject({
			_tag: "UploadRejected",
			status: 413,
			maxSizeBytes: MAX_UPLOAD_SIZE_BYTES,
		});
		expect(storage.deleted).toEqual(["uploads/oversized.png"]);
	});

	test("deletes an oversized object even when its content type is unsupported", async () => {
		const storage = fakeStorage(
			storedObject(MAX_UPLOAD_SIZE_BYTES + 1, "application/zip"),
		);

		const failure = failureOf(await statWith(storage, "uploads/oversized.zip"));

		expect(failure).toMatchObject({ _tag: "UploadRejected", status: 413 });
		expect(storage.deleted).toEqual(["uploads/oversized.zip"]);
	});

	test("still rejects an oversized object when deleting it fails", async () => {
		const storage = fakeStorage(storedObject(MAX_UPLOAD_SIZE_BYTES + 1), {
			failDelete: true,
		});
		const logged = spyOn(console, "error").mockImplementation(() => {});

		const failure = failureOf(await statWith(storage));
		logged.mockRestore();

		expect(failure).toMatchObject({ _tag: "UploadRejected", status: 413 });
	});

	test("rejects an unsupported content type", async () => {
		const storage = fakeStorage(storedObject(1024, "application/zip"));

		expect(failureOf(await statWith(storage))).toMatchObject({
			_tag: "UploadRejected",
			status: 400,
		});
	});

	test("reports a missing object and a storage failure differently", async () => {
		const missing = fakeStorage(() =>
			Effect.fail(new ObjectNotFound({ objectKey: "uploads/object.png" })),
		);
		const unavailable = fakeStorage(() =>
			Effect.fail(
				new StorageFailed({
					operation: "stat",
					objectKey: "uploads/object.png",
					cause: new Error("connection refused"),
				}),
			),
		);

		expect(failureOf(await statWith(missing))).toBeInstanceOf(ObjectNotFound);
		expect(failureOf(await statWith(unavailable))).toBeInstanceOf(
			StorageFailed,
		);
	});
});

describe("UploadStorage.fromClient", () => {
	function statWithClient(
		stat: () => Promise<unknown>,
		timeout?: Duration.Input,
	) {
		const client = { stat } as unknown as S3Client;
		return Effect.runPromiseExit(
			Effect.gen(function* () {
				const storage = yield* UploadStorage;
				return yield* storage.stat("uploads/object.png");
			}).pipe(Effect.provide(UploadStorage.fromClient(client, timeout))),
		);
	}
	const statThrough = (error: unknown) =>
		statWithClient(async () => {
			throw error;
		});

	test("treats NoSuchKey as a missing object", async () => {
		expect(failureOf(await statThrough({ code: "NoSuchKey" }))).toBeInstanceOf(
			ObjectNotFound,
		);
	});

	test("fails a stat that never answers once the timeout passes", async () => {
		const exit = await statWithClient(() => new Promise(() => {}), "20 millis");
		expect(failureOf(exit)).toBeInstanceOf(StorageFailed);
	});

	test("treats any other storage error as a storage failure", async () => {
		for (const code of ["ConnectionRefused", "UnknownError", "AccessDenied"]) {
			expect(failureOf(await statThrough({ code }))).toBeInstanceOf(
				StorageFailed,
			);
		}
	});
});
