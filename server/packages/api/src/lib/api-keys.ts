import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	type APIKeyKind,
	type APIKeyPermissionDomain,
	type APIKeyPermissions,
	hashAPIKey,
	resolveAPIKeyPermissions,
} from "@arcnem-vision/shared";
import { and, eq, gt, isNull, or } from "drizzle-orm";

const { apikeys } = schema;

export type {
	APIKeyKind,
	APIKeyPermissionDomain,
	APIKeyPermissions,
} from "@arcnem-vision/shared";

export type VerifiedAPIKey = {
	id: string;
	userId: string;
	organizationId: string;
	projectId: string;
	deviceId: string | null;
	kind: APIKeyKind;
	permissions: APIKeyPermissions;
	metadata: Record<string, unknown> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(
		value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			(Object.getPrototypeOf(value) === Object.prototype ||
				Object.getPrototypeOf(value) === null),
	);
}

function parseJSONRecord(value: string | null): Record<string, unknown> | null {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(value);
		return isPlainObject(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function normalizeKind(value: string | null): APIKeyKind {
	return value === "service" ? "service" : "device";
}

function toVerifiedAPIKey(row: {
	id: string;
	userId: string;
	organizationId: string;
	projectId: string;
	deviceId: string | null;
	kind: string | null;
	permissions: string | null;
	metadata: string | null;
}): VerifiedAPIKey {
	return {
		id: row.id,
		userId: row.userId,
		organizationId: row.organizationId,
		projectId: row.projectId,
		deviceId: row.deviceId,
		kind: normalizeKind(row.kind),
		permissions: resolveAPIKeyPermissions(
			row.permissions,
			normalizeKind(row.kind),
		),
		metadata: parseJSONRecord(row.metadata),
	};
}

export async function verifyAPIKey(
	dbClient: PGDB,
	rawKey: string,
): Promise<VerifiedAPIKey | null> {
	const hashedKey = await hashAPIKey(rawKey);
	const [apiKey] = await dbClient
		.select({
			id: apikeys.id,
			userId: apikeys.userId,
			organizationId: apikeys.organizationId,
			projectId: apikeys.projectId,
			deviceId: apikeys.deviceId,
			kind: apikeys.kind,
			permissions: apikeys.permissions,
			metadata: apikeys.metadata,
		})
		.from(apikeys)
		.where(
			and(
				eq(apikeys.key, hashedKey),
				eq(apikeys.enabled, true),
				or(isNull(apikeys.expiresAt), gt(apikeys.expiresAt, new Date())),
			),
		)
		.limit(1);

	return apiKey ? toVerifiedAPIKey(apiKey) : null;
}

export async function findAPIKeyForDebugMode(
	dbClient: PGDB,
	rawKey: string,
): Promise<VerifiedAPIKey | null> {
	const hashedKey = await hashAPIKey(rawKey);
	const [apiKey] = await dbClient
		.select({
			id: apikeys.id,
			userId: apikeys.userId,
			organizationId: apikeys.organizationId,
			projectId: apikeys.projectId,
			deviceId: apikeys.deviceId,
			kind: apikeys.kind,
			permissions: apikeys.permissions,
			metadata: apikeys.metadata,
		})
		.from(apikeys)
		.where(eq(apikeys.key, hashedKey))
		.limit(1);

	return apiKey ? toVerifiedAPIKey(apiKey) : null;
}

export function apiKeyHasPermission(
	apiKey: VerifiedAPIKey,
	domain: APIKeyPermissionDomain,
	action: string,
) {
	const granted = apiKey.permissions[domain] ?? [];
	return granted.includes("*") || granted.includes(action);
}
