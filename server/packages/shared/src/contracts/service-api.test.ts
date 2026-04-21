import { describe, expect, test } from "bun:test";
import {
	serviceDocumentListQuerySchema,
	serviceDocumentScopeSchema,
	serviceDocumentVisibilityUpdateSchema,
	serviceUploadAcknowledgeRequestSchema,
	serviceUploadAcknowledgeResponseSchema,
	serviceUploadPresignRequestSchema,
	serviceWorkflowExecutionRequestSchema,
} from "./service-api";

describe("service API schemas", () => {
	test("rejects empty scope objects", () => {
		const parsed = serviceDocumentScopeSchema.safeParse({});

		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.issues[0]?.message).toContain("scope must include");
		}
	});

	test("rejects contradictory api key filters", () => {
		const parsed = serviceDocumentScopeSchema.safeParse({
			apiKeyIds: ["key-1"],
			apiKeyBound: false,
		});

		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.issues[0]?.message).toContain(
				"apiKeyIds cannot be combined",
			);
		}
	});

	test("requires workflow execution requests to include document ids or scope", () => {
		const parsed = serviceWorkflowExecutionRequestSchema.safeParse({
			workflowId: "workflow-1",
		});

		expect(parsed.success).toBe(false);
		if (!parsed.success) {
			expect(parsed.error.issues[0]?.message).toContain(
				"documentIds or scope is required",
			);
		}
	});

	test("accepts scoped workflow execution requests with json initial state", () => {
		const parsed = serviceWorkflowExecutionRequestSchema.safeParse({
			workflowId: "workflow-1",
			scope: {
				apiKeyIds: ["key-1"],
				apiKeyBound: true,
			},
			initialState: {
				analysis_label: "smoke-test",
				tags: ["alpha", "beta"],
				extra: {
					visible: true,
				},
			},
		});

		expect(parsed.success).toBe(true);
	});

	test("rejects contradictory document list filters", () => {
		const parsed = serviceDocumentListQuerySchema.safeParse({
			apiKeyIds: ["key-1"],
			apiKeyBound: false,
		});

		expect(parsed.success).toBe(false);
	});

	test("allows upload visibility to be declared at presign time", () => {
		const parsed = serviceUploadPresignRequestSchema.safeParse({
			contentType: "image/png",
			size: 1024,
			visibility: "public",
		});

		expect(parsed.success).toBe(true);
	});

	test("keeps upload acknowledgements minimal", () => {
		const parsed = serviceUploadAcknowledgeRequestSchema.safeParse({
			objectKey: "uploads/demo.png",
			visibility: "public",
		});

		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).toEqual({ objectKey: "uploads/demo.png" });
		}
	});

	test("accepts minimal upload acknowledgements", () => {
		expect(
			serviceUploadAcknowledgeResponseSchema.safeParse({
				status: "verified",
				documentId: "doc-1",
				presignedUploadId: "upload-1",
			}).success,
		).toBe(true);
	});

	test("requires at least one document id for visibility changes", () => {
		const parsed = serviceDocumentVisibilityUpdateSchema.safeParse({
			documentIds: [],
			visibility: "public",
		});

		expect(parsed.success).toBe(false);
	});
});
