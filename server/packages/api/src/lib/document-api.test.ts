import { afterEach, describe, expect, test } from "bun:test";
import { toAPIDocumentItem } from "./document-api";

const baseRow = {
	id: "doc-1",
	objectKey: "uploads/test.jpg",
	contentType: "image/jpeg",
	sizeBytes: 123,
	createdAt: "2026-04-14T00:00:00.000Z",
	description: "Test image",
	apiKeyId: null,
};

const s3Client = {
	presign: () => "https://signed.example/uploads/test.jpg",
};

const originalS3PublicBaseURL = process.env.S3_PUBLIC_BASE_URL;

afterEach(() => {
	if (originalS3PublicBaseURL === undefined) {
		delete process.env.S3_PUBLIC_BASE_URL;
		return;
	}

	process.env.S3_PUBLIC_BASE_URL = originalS3PublicBaseURL;
});

describe("toAPIDocumentItem", () => {
	test("builds a public URL from the configured base URL", () => {
		process.env.S3_PUBLIC_BASE_URL = "https://cdn.example/public  ";

		const document = toAPIDocumentItem(
			{
				...baseRow,
				visibility: "public",
			},
			s3Client as never,
		);

		expect(document.publicUrl).toBe(
			"https://cdn.example/public/uploads/test.jpg",
		);
	});

	test("does not require the public base URL for non-public documents", () => {
		delete process.env.S3_PUBLIC_BASE_URL;

		const document = toAPIDocumentItem(
			{
				...baseRow,
				visibility: "org",
			},
			s3Client as never,
		);

		expect(document.publicUrl).toBeNull();
	});

	test("requires the public base URL for public documents", () => {
		delete process.env.S3_PUBLIC_BASE_URL;

		expect(() =>
			toAPIDocumentItem(
				{
					...baseRow,
					visibility: "public",
				},
				s3Client as never,
			),
		).toThrow("Environment variable S3_PUBLIC_BASE_URL is not defined");
	});
});
