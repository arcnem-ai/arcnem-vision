import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	type APIKeyKind,
	type APIKeyPermissionDomain,
	type APIKeyPermissions,
	hashAPIKey,
	resolveAPIKeyPermissions,
} from "@arcnem-vision/shared";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

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
	agentGraphId: string | null;
	kind: APIKeyKind;
	permissions: APIKeyPermissions;
	metadata: Record<string, unknown> | null;
};

type StoredAPIKeyRow = {
	id: string;
	userId: string;
	organizationId: string;
	projectId: string;
	agentGraphId: string | null;
	kind: string | null;
	permissions: string | null;
	metadata: string | null;
	enabled: boolean;
	expiresAt: Date | string | null;
	rateLimitEnabled: boolean;
	rateLimitTimeWindow: number;
	rateLimitMax: number;
	requestCount: number;
	lastRequest: Date | string | null;
};

export type APIKeyRateLimitOutcome = {
	allowed: boolean;
	lastRequest: Date;
	requestCount: number;
	retryAfterMs: number | null;
};

export type VerifiedAPIKeyRequestResult =
	| {
			ok: true;
			apiKey: VerifiedAPIKey;
	  }
	| {
			ok: false;
			status: 401 | 429;
			message: string;
			retryAfterSeconds?: number;
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
	return value === "service" ? "service" : "workflow";
}

function toVerifiedAPIKey(row: {
	id: string;
	userId: string;
	organizationId: string;
	projectId: string;
	agentGraphId: string | null;
	kind: string | null;
	permissions: string | null;
	metadata: string | null;
}): VerifiedAPIKey {
	return {
		id: row.id,
		userId: row.userId,
		organizationId: row.organizationId,
		projectId: row.projectId,
		agentGraphId: row.agentGraphId,
		kind: normalizeKind(row.kind),
		permissions: resolveAPIKeyPermissions(
			row.permissions,
			normalizeKind(row.kind),
		),
		metadata: parseJSONRecord(row.metadata),
	};
}

function toDate(value: Date | string | null): Date | null {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function evaluateAPIKeyRateLimit(
	input: Pick<
		StoredAPIKeyRow,
		| "rateLimitEnabled"
		| "rateLimitTimeWindow"
		| "rateLimitMax"
		| "requestCount"
		| "lastRequest"
	>,
	now = new Date(),
): APIKeyRateLimitOutcome {
	if (!input.rateLimitEnabled) {
		return {
			allowed: true,
			lastRequest: now,
			requestCount: input.requestCount,
			retryAfterMs: null,
		};
	}

	const previousRequestAt = toDate(input.lastRequest);
	if (!previousRequestAt) {
		return {
			allowed: true,
			lastRequest: now,
			requestCount: 1,
			retryAfterMs: null,
		};
	}

	const elapsedMs = now.getTime() - previousRequestAt.getTime();
	if (elapsedMs > input.rateLimitTimeWindow) {
		return {
			allowed: true,
			lastRequest: now,
			requestCount: 1,
			retryAfterMs: null,
		};
	}

	if (input.requestCount >= input.rateLimitMax) {
		return {
			allowed: false,
			lastRequest: previousRequestAt,
			requestCount: input.requestCount,
			retryAfterMs: Math.max(0, input.rateLimitTimeWindow - elapsedMs),
		};
	}

	return {
		allowed: true,
		lastRequest: now,
		requestCount: input.requestCount + 1,
		retryAfterMs: null,
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
			agentGraphId: apikeys.agentGraphId,
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

export async function verifyAndConsumeAPIKey(
	dbClient: PGDB,
	rawKey: string,
	now = new Date(),
): Promise<VerifiedAPIKeyRequestResult> {
	const hashedKey = await hashAPIKey(rawKey);

	return dbClient.transaction(async (tx) => {
		const result = await tx.execute(sql`
			SELECT
				${apikeys.id} AS id,
				${apikeys.userId} AS "userId",
				${apikeys.organizationId} AS "organizationId",
				${apikeys.projectId} AS "projectId",
				${apikeys.agentGraphId} AS "agentGraphId",
				${apikeys.kind} AS kind,
				${apikeys.permissions} AS permissions,
				${apikeys.metadata} AS metadata,
				${apikeys.enabled} AS enabled,
				${apikeys.expiresAt} AS "expiresAt",
				${apikeys.rateLimitEnabled} AS "rateLimitEnabled",
				${apikeys.rateLimitTimeWindow} AS "rateLimitTimeWindow",
				${apikeys.rateLimitMax} AS "rateLimitMax",
				${apikeys.requestCount} AS "requestCount",
				${apikeys.lastRequest} AS "lastRequest"
			FROM ${apikeys}
			WHERE ${apikeys.key} = ${hashedKey}
			LIMIT 1
			FOR UPDATE
		`);

		const row = (result.rows[0] ?? null) as StoredAPIKeyRow | null;
		if (!row?.enabled) {
			return {
				ok: false as const,
				status: 401 as const,
				message: "Unauthorized",
			};
		}

		const expiresAt = toDate(row.expiresAt);
		if (expiresAt && expiresAt.getTime() <= now.getTime()) {
			return {
				ok: false as const,
				status: 401 as const,
				message: "Unauthorized",
			};
		}

		const rateLimit = evaluateAPIKeyRateLimit(row, now);
		if (!rateLimit.allowed) {
			return {
				ok: false as const,
				status: 429 as const,
				message: "Rate limit exceeded",
				retryAfterSeconds: Math.max(
					1,
					Math.ceil((rateLimit.retryAfterMs ?? 0) / 1000),
				),
			};
		}

		await tx
			.update(apikeys)
			.set({
				lastRequest: rateLimit.lastRequest,
				requestCount: rateLimit.requestCount,
				updatedAt: now,
			})
			.where(eq(apikeys.id, row.id));

		return {
			ok: true as const,
			apiKey: toVerifiedAPIKey(row),
		};
	});
}

export async function verifyAndConsumeAPIKeyForDebugMode(
	dbClient: PGDB,
	rawKey: string,
	now = new Date(),
): Promise<VerifiedAPIKey | null> {
	const hashedKey = await hashAPIKey(rawKey);

	return dbClient.transaction(async (tx) => {
		const result = await tx.execute(sql`
			SELECT
				${apikeys.id} AS id,
				${apikeys.userId} AS "userId",
				${apikeys.organizationId} AS "organizationId",
				${apikeys.projectId} AS "projectId",
				${apikeys.agentGraphId} AS "agentGraphId",
				${apikeys.kind} AS kind,
				${apikeys.permissions} AS permissions,
				${apikeys.metadata} AS metadata,
				${apikeys.enabled} AS enabled,
				${apikeys.expiresAt} AS "expiresAt",
				${apikeys.rateLimitEnabled} AS "rateLimitEnabled",
				${apikeys.rateLimitTimeWindow} AS "rateLimitTimeWindow",
				${apikeys.rateLimitMax} AS "rateLimitMax",
				${apikeys.requestCount} AS "requestCount",
				${apikeys.lastRequest} AS "lastRequest"
			FROM ${apikeys}
			WHERE ${apikeys.key} = ${hashedKey}
			LIMIT 1
			FOR UPDATE
		`);

		const row = (result.rows[0] ?? null) as StoredAPIKeyRow | null;
		if (!row) {
			return null;
		}

		await tx
			.update(apikeys)
			.set({
				lastRequest: now,
				requestCount: row.requestCount + 1,
				updatedAt: now,
			})
			.where(eq(apikeys.id, row.id));

		return toVerifiedAPIKey(row);
	});
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
			agentGraphId: apikeys.agentGraphId,
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
