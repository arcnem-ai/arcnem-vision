import { describe, expect, test } from "bun:test";
import type { S3Client } from "bun";
import { MAX_UPLOAD_SIZE_BYTES } from "@/constants/uploads";
import { statUploadedObject } from "./acknowledge";

function fakeStorage(size: number, type = "image/png") {
	const deleted: string[] = [];
	const s3Client = {
		stat: async () => ({
			size,
			lastModified: new Date("2026-09-01T00:00:00Z"),
			etag: '"etag"',
			type,
		}),
		delete: async (key: string) => {
			deleted.push(key);
		},
	} as unknown as S3Client;
	return { s3Client, deleted };
}

describe("statUploadedObject", () => {
	test("accepts an object at the maximum upload size", async () => {
		const { s3Client, deleted } = fakeStorage(MAX_UPLOAD_SIZE_BYTES);

		const verified = await statUploadedObject({
			s3Client,
			objectKey: "uploads/at-limit.png",
		});

		expect(verified.size).toBe(MAX_UPLOAD_SIZE_BYTES);
		expect(deleted).toEqual([]);
	});

	test("rejects and deletes an object larger than the declared limit", async () => {
		const { s3Client, deleted } = fakeStorage(MAX_UPLOAD_SIZE_BYTES + 1);

		const error = await statUploadedObject({
			s3Client,
			objectKey: "uploads/oversized.png",
		}).catch((caught: unknown) => caught);

		expect(error).toMatchObject({
			status: 413,
			payload: { maxSizeBytes: MAX_UPLOAD_SIZE_BYTES },
		});
		expect(deleted).toEqual(["uploads/oversized.png"]);
	});

	test("deletes an oversized object even when its content type is unsupported", async () => {
		const { s3Client, deleted } = fakeStorage(
			MAX_UPLOAD_SIZE_BYTES + 1,
			"application/zip",
		);

		const error = await statUploadedObject({
			s3Client,
			objectKey: "uploads/oversized.zip",
		}).catch((caught: unknown) => caught);

		expect(error).toMatchObject({ status: 413 });
		expect(deleted).toEqual(["uploads/oversized.zip"]);
	});
});
