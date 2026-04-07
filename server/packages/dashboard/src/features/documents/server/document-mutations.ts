import { createServerFn } from "@tanstack/react-start";
import { DASHBOARD_ENV_VAR } from "@/env/dashboardEnvVar";
import { getDashboardEnvVar } from "@/env/getDashboardEnvVar";
import { getDashboardSessionCookieHeader } from "@/features/dashboard/server/session-context";
import type {
	DocumentUploadAckResponse,
	DocumentUploadTarget,
	DocumentWorkflowRunResponse,
} from "@/features/documents/types";

const API_URL = getDashboardEnvVar(DASHBOARD_ENV_VAR.API_URL);

async function buildHeaders() {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	const cookieHeader = await getDashboardSessionCookieHeader();

	if (cookieHeader) {
		headers.Cookie = cookieHeader;
	}

	return headers;
}

async function parseAPIResponse<T>(response: Response): Promise<T> {
	if (response.ok) {
		return response.json() as Promise<T>;
	}

	let message = `${response.status} ${response.statusText}`;
	try {
		const payload = (await response.json()) as { message?: unknown };
		if (typeof payload.message === "string" && payload.message.length > 0) {
			message = payload.message;
		}
	} catch {
		// fall back to the HTTP status text
	}

	throw new Error(message);
}

export const createDocumentUpload = createServerFn({ method: "POST" })
	.inputValidator(
		(input: { projectId: string; contentType: string; size: number }) => input,
	)
	.handler(async ({ data }): Promise<DocumentUploadTarget> => {
		const response = await fetch(
			`${API_URL}/api/dashboard/documents/uploads/presign`,
			{
				method: "POST",
				headers: await buildHeaders(),
				body: JSON.stringify(data),
			},
		);

		return parseAPIResponse<DocumentUploadTarget>(response);
	});

export const acknowledgeDocumentUpload = createServerFn({ method: "POST" })
	.inputValidator((input: { objectKey: string }) => input)
	.handler(async ({ data }): Promise<DocumentUploadAckResponse> => {
		const response = await fetch(
			`${API_URL}/api/dashboard/documents/uploads/ack`,
			{
				method: "POST",
				headers: await buildHeaders(),
				body: JSON.stringify(data),
			},
		);

		return parseAPIResponse<DocumentUploadAckResponse>(response);
	});

export const runDocumentWorkflow = createServerFn({ method: "POST" })
	.inputValidator((input: { documentId: string; workflowId: string }) => input)
	.handler(async ({ data }): Promise<DocumentWorkflowRunResponse> => {
		const response = await fetch(
			`${API_URL}/api/dashboard/documents/${data.documentId}/run`,
			{
				method: "POST",
				headers: await buildHeaders(),
				body: JSON.stringify({ workflowId: data.workflowId }),
			},
		);

		return parseAPIResponse<DocumentWorkflowRunResponse>(response);
	});
