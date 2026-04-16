import { apikeys, documents, projects } from "@arcnem-vision/db/schema";
import type { PGDB } from "@arcnem-vision/db/server";
import type { ChatScope } from "@arcnem-vision/shared";
import { and, count, eq, inArray } from "drizzle-orm";

async function assertScopeIdsBelongToOrganization(
	ids: string[] | undefined,
	label: string,
	countScopedRecords: (ids: string[]) => Promise<number>,
) {
	if (!ids?.length) {
		return;
	}

	const total = await countScopedRecords(ids);
	if (total !== ids.length) {
		throw new Error(`Requested ${label} are outside the active organization.`);
	}
}

function dedupeIds(ids?: string[]) {
	if (!ids?.length) {
		return undefined;
	}

	const deduped = Array.from(
		new Set(ids.map((id) => id.trim()).filter(Boolean)),
	);
	return deduped.length > 0 ? deduped : undefined;
}

export async function resolveRequestedChatScope(
	db: PGDB,
	authOrganizationId: string,
	requestedScope?: ChatScope,
): Promise<ChatScope> {
	const scope = requestedScope ?? {
		kind: "organization",
		organizationId: authOrganizationId,
	};

	if (scope.organizationId !== authOrganizationId) {
		throw new Error("Requested scope does not match the active organization.");
	}

	const normalizedScope: ChatScope = {
		kind: "organization",
		organizationId: authOrganizationId,
		projectIds: dedupeIds(scope.projectIds),
		apiKeyIds: dedupeIds(scope.apiKeyIds),
		documentIds: dedupeIds(scope.documentIds),
	};

	await assertScopeIdsBelongToOrganization(
		normalizedScope.projectIds,
		"projectIds",
		async (ids) => {
			const [{ total }] = await db
				.select({ total: count() })
				.from(projects)
				.where(
					and(
						eq(projects.organizationId, authOrganizationId),
						inArray(projects.id, ids),
					),
				);

			return total;
		},
	);
	await assertScopeIdsBelongToOrganization(
		normalizedScope.apiKeyIds,
		"apiKeyIds",
		async (ids) => {
			const [{ total }] = await db
				.select({ total: count() })
				.from(apikeys)
				.where(
					and(
						eq(apikeys.organizationId, authOrganizationId),
						inArray(apikeys.id, ids),
					),
				);

			return total;
		},
	);
	await assertScopeIdsBelongToOrganization(
		normalizedScope.documentIds,
		"documentIds",
		async (ids) => {
			const [{ total }] = await db
				.select({ total: count() })
				.from(documents)
				.where(
					and(
						eq(documents.organizationId, authOrganizationId),
						inArray(documents.id, ids),
					),
				);

			return total;
		},
	);

	return normalizedScope;
}
