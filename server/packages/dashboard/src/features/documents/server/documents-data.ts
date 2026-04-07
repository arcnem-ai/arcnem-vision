import { createServerFn } from "@tanstack/react-start";
import { DASHBOARD_ENV_VAR } from "@/env/dashboardEnvVar";
import { getDashboardEnvVar } from "@/env/getDashboardEnvVar";
import {
	getDashboardSessionCookieHeader,
	getSessionContext,
} from "@/features/dashboard/server/session-context";
import type {
	DocumentItem,
	DocumentOCRResultsResponse,
	DocumentSegmentationsResponse,
	DocumentsResponse,
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

export const getDocuments = createServerFn({ method: "GET" })
	.inputValidator(
		(input: {
			organizationId: string;
			cursor?: string;
			limit?: number;
			query?: string;
			projectId?: string;
			deviceId?: string;
			dashboardUploadsOnly?: boolean;
		}) => input,
	)
	.handler(async ({ data }): Promise<DocumentsResponse> => {
		const context = await getSessionContext();
		if (!context.session || !context.organizationId) {
			return { documents: [], nextCursor: null };
		}

		const params = new URLSearchParams({
			organizationId: context.organizationId,
		});
		if (data.limit) params.set("limit", String(data.limit));
		if (data.cursor) params.set("cursor", data.cursor);
		if (data.query?.trim()) params.set("query", data.query.trim());
		if (data.projectId?.trim()) params.set("projectId", data.projectId.trim());
		if (data.deviceId?.trim()) params.set("deviceId", data.deviceId.trim());
		if (data.dashboardUploadsOnly) params.set("dashboardUploadsOnly", "true");

		const response = await fetch(
			`${API_URL}/api/dashboard/documents?${params}`,
			{ headers: await buildHeaders() },
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch documents: ${response.status} ${response.statusText}`,
			);
		}

		return (await response.json()) as DocumentsResponse;
	});

export const getDocumentSegmentations = createServerFn({ method: "GET" })
	.inputValidator((input: { documentId: string }) => input)
	.handler(async ({ data }): Promise<DocumentSegmentationsResponse> => {
		const response = await fetch(
			`${API_URL}/api/dashboard/documents/${encodeURIComponent(data.documentId)}/segmentations`,
			{ headers: await buildHeaders() },
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch segmented results: ${response.status} ${response.statusText}`,
			);
		}

		return (await response.json()) as DocumentSegmentationsResponse;
	});

export const getDocumentOCRResults = createServerFn({ method: "GET" })
	.inputValidator((input: { documentId: string }) => input)
	.handler(async ({ data }): Promise<DocumentOCRResultsResponse> => {
		const response = await fetch(
			`${API_URL}/api/dashboard/documents/${encodeURIComponent(data.documentId)}/ocr`,
			{ headers: await buildHeaders() },
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch OCR results: ${response.status} ${response.statusText}`,
			);
		}

		return (await response.json()) as DocumentOCRResultsResponse;
	});

export const getDocument = createServerFn({ method: "GET" })
	.inputValidator((input: { documentId: string }) => input)
	.handler(async ({ data }): Promise<DocumentItem> => {
		const response = await fetch(
			`${API_URL}/api/dashboard/documents/${encodeURIComponent(data.documentId)}`,
			{ headers: await buildHeaders() },
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch document: ${response.status} ${response.statusText}`,
			);
		}

		return (await response.json()) as DocumentItem;
	});
