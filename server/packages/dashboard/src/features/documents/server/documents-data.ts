import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { DocumentsResponse } from "@/features/documents/types";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export const getDocuments = createServerFn({ method: "GET" })
	.inputValidator(
		(input: {
			organizationId: string;
			cursor?: string;
			limit?: number;
			query?: string;
		}) => input,
	)
	.handler(async ({ data }): Promise<DocumentsResponse> => {
		const params = new URLSearchParams({
			organizationId: data.organizationId,
		});
		if (data.limit) params.set("limit", String(data.limit));
		if (data.cursor) params.set("cursor", data.cursor);
		if (data.query?.trim()) params.set("query", data.query.trim());

		const sessionToken = getCookie("better-auth.session_token");
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (sessionToken) {
			headers.Cookie = `better-auth.session_token=${sessionToken}`;
		}

		const response = await fetch(
			`${API_URL}/api/dashboard/documents?${params}`,
			{ headers },
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch documents: ${response.status} ${response.statusText}`,
			);
		}

		return response.json();
	});
