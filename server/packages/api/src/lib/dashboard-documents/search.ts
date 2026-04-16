import { getApiMcpClient } from "@/clients/apiMcpClient";
import type {
	DashboardDocumentSearchFilters,
	DashboardDocumentSearchMatch,
	DocumentRow,
} from "./types";

type DashboardDocumentSearchScope = {
	organization_id: string;
	project_ids?: string[];
	api_key_ids?: string[];
	dashboard_uploads_only?: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function buildDashboardDocumentSearchScope(
	organizationId: string,
	filters: DashboardDocumentSearchFilters,
): DashboardDocumentSearchScope {
	const scope: DashboardDocumentSearchScope = {
		organization_id: organizationId,
	};

	if (filters.projectId) {
		scope.project_ids = [filters.projectId];
	}
	if (filters.apiKeyId) {
		scope.api_key_ids = [filters.apiKeyId];
	}
	if (filters.dashboardUploadsOnly) {
		scope.dashboard_uploads_only = true;
	}

	return scope;
}

function parseDashboardDocumentSearchMatches(
	payload: unknown,
): DashboardDocumentSearchMatch[] {
	if (!isRecord(payload) || !Array.isArray(payload.matches)) {
		throw new Error(
			"MCP search_documents_in_scope returned an invalid payload.",
		);
	}

	return payload.matches.map((match, index) => {
		if (
			!isRecord(match) ||
			typeof match.documentId !== "string" ||
			typeof match.objectKey !== "string" ||
			typeof match.contentType !== "string" ||
			typeof match.createdAt !== "string" ||
			typeof match.projectId !== "string" ||
			typeof match.snippet !== "string"
		) {
			throw new Error(
				`MCP search_documents_in_scope returned an invalid match at index ${index}.`,
			);
		}

		const sizeBytes =
			typeof match.sizeBytes === "number"
				? match.sizeBytes
				: typeof match.sizeBytes === "string"
					? Number(match.sizeBytes)
					: Number.NaN;
		if (!Number.isFinite(sizeBytes)) {
			throw new Error(
				`MCP search_documents_in_scope returned an invalid sizeBytes at index ${index}.`,
			);
		}

		return {
			documentId: match.documentId,
			objectKey: match.objectKey,
			contentType: match.contentType,
			sizeBytes,
			createdAt: match.createdAt,
			projectId: match.projectId,
			apiKeyId: typeof match.apiKeyId === "string" ? match.apiKeyId : null,
			snippet: match.snippet,
		};
	});
}

function mapDashboardSearchMatchToRow(
	match: DashboardDocumentSearchMatch,
): DocumentRow {
	return {
		id: match.documentId,
		objectKey: match.objectKey,
		contentType: match.contentType,
		sizeBytes: match.sizeBytes,
		createdAt: match.createdAt,
		description: match.snippet,
		distance: null,
		projectId: match.projectId,
		apiKeyId: match.apiKeyId,
	};
}

export async function searchDashboardDocumentsByMeaning(
	organizationId: string,
	query: string,
	limit: number,
	filters: DashboardDocumentSearchFilters,
): Promise<DocumentRow[]> {
	const response = await getApiMcpClient().callTool<unknown>(
		"search_documents_in_scope",
		{
			query,
			limit,
			scope: buildDashboardDocumentSearchScope(organizationId, filters),
		},
	);

	return parseDashboardDocumentSearchMatches(response)
		.filter((match) => {
			if (filters.projectId && match.projectId !== filters.projectId) {
				return false;
			}
			if (filters.dashboardUploadsOnly) {
				return match.apiKeyId == null;
			}
			if (filters.apiKeyId) {
				return match.apiKeyId === filters.apiKeyId;
			}
			return true;
		})
		.map(mapDashboardSearchMatchToRow);
}
