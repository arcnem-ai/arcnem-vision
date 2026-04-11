import { createServerFn } from "@tanstack/react-start";
import type {
	DocumentUploadAckResponse,
	DocumentUploadTarget,
	DocumentWorkflowRunResponse,
} from "@/features/documents/types";
import { fetchDashboardAPI } from "@/lib/api-server";

export const createDocumentUpload = createServerFn({ method: "POST" })
	.inputValidator(
		(input: { projectId: string; contentType: string; size: number }) => input,
	)
	.handler(async ({ data }): Promise<DocumentUploadTarget> => {
		return fetchDashboardAPI<DocumentUploadTarget>(
			"/dashboard/documents/uploads/presign",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to create document upload target.",
			},
		);
	});

export const acknowledgeDocumentUpload = createServerFn({ method: "POST" })
	.inputValidator((input: { objectKey: string }) => input)
	.handler(async ({ data }): Promise<DocumentUploadAckResponse> => {
		return fetchDashboardAPI<DocumentUploadAckResponse>(
			"/dashboard/documents/uploads/ack",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to acknowledge document upload.",
			},
		);
	});

export const runDocumentWorkflow = createServerFn({ method: "POST" })
	.inputValidator((input: { documentId: string; workflowId: string }) => input)
	.handler(async ({ data }): Promise<DocumentWorkflowRunResponse> => {
		return fetchDashboardAPI<DocumentWorkflowRunResponse>(
			`/dashboard/documents/${data.documentId}/run`,
			{
				method: "POST",
				body: { workflowId: data.workflowId },
				fallbackErrorMessage: "Failed to queue document workflow run.",
			},
		);
	});
