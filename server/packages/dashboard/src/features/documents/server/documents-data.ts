import { createServerFn } from "@tanstack/react-start";
import type {
	DocumentItem,
	DocumentOCRResultsResponse,
	DocumentSegmentationsResponse,
	DocumentsResponse,
} from "@/features/documents/types";
import { fetchDashboardAPI } from "@/lib/api-server";

export const getDocuments = createServerFn({ method: "GET" })
	.inputValidator(
		(input: {
			cursor?: string;
			limit?: number;
			query?: string;
			projectId?: string;
			deviceId?: string;
			dashboardUploadsOnly?: boolean;
		}) => input,
	)
	.handler(async ({ data }): Promise<DocumentsResponse> => {
		const params = new URLSearchParams();
		if (data.limit) params.set("limit", String(data.limit));
		if (data.cursor) params.set("cursor", data.cursor);
		if (data.query?.trim()) params.set("query", data.query.trim());
		if (data.projectId?.trim()) params.set("projectId", data.projectId.trim());
		if (data.deviceId?.trim()) params.set("deviceId", data.deviceId.trim());
		if (data.dashboardUploadsOnly) params.set("dashboardUploadsOnly", "true");

		return fetchDashboardAPI<DocumentsResponse>(
			`/dashboard/documents?${params}`,
			{
				method: "GET",
				fallbackErrorMessage: "Failed to fetch documents.",
			},
		);
	});

export const getDocumentSegmentations = createServerFn({ method: "GET" })
	.inputValidator((input: { documentId: string }) => input)
	.handler(async ({ data }): Promise<DocumentSegmentationsResponse> => {
		return fetchDashboardAPI<DocumentSegmentationsResponse>(
			`/dashboard/documents/${encodeURIComponent(data.documentId)}/segmentations`,
			{
				method: "GET",
				fallbackErrorMessage: "Failed to fetch segmented results.",
			},
		);
	});

export const getDocumentOCRResults = createServerFn({ method: "GET" })
	.inputValidator((input: { documentId: string }) => input)
	.handler(async ({ data }): Promise<DocumentOCRResultsResponse> => {
		return fetchDashboardAPI<DocumentOCRResultsResponse>(
			`/dashboard/documents/${encodeURIComponent(data.documentId)}/ocr`,
			{
				method: "GET",
				fallbackErrorMessage: "Failed to fetch OCR results.",
			},
		);
	});

export const getDocument = createServerFn({ method: "GET" })
	.inputValidator((input: { documentId: string }) => input)
	.handler(async ({ data }): Promise<DocumentItem> => {
		return fetchDashboardAPI<DocumentItem>(
			`/dashboard/documents/${encodeURIComponent(data.documentId)}`,
			{
				method: "GET",
				fallbackErrorMessage: "Failed to fetch document.",
			},
		);
	});
