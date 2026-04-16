import { describe, expect, test } from "bun:test";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	evaluateAPIKeyRateLimit,
	verifyAndConsumeAPIKey,
	verifyAndConsumeAPIKeyForDebugMode,
} from "./api-keys";

const baseRow = {
	id: "key-1",
	userId: "user-1",
	organizationId: "org-1",
	projectId: "project-1",
	agentGraphId: "graph-1",
	kind: "workflow",
	permissions: JSON.stringify({ workflows: ["execute"] }),
	metadata: JSON.stringify({ source: "test" }),
	enabled: true,
	expiresAt: null,
	rateLimitEnabled: true,
	rateLimitTimeWindow: 60_000,
	rateLimitMax: 2,
	requestCount: 0,
	lastRequest: null as Date | null,
};

function buildFakeDB(
	responses: Array<{
		rows: Array<Record<string, unknown>>;
	}>,
) {
	const queuedResponses = [...responses];
	const calls: unknown[] = [];

	const db = {
		transaction: async <T>(
			callback: (tx: {
				execute: (
					query: unknown,
				) => Promise<{ rows: Array<Record<string, unknown>> }>;
				update: (table: unknown) => {
					set: (values: Record<string, unknown>) => {
						where: (
							clause: unknown,
						) => Promise<{ rows: Array<Record<string, unknown>> }>;
					};
				};
			}) => Promise<T>,
		) =>
			callback({
				execute: async (query: unknown) => {
					calls.push(query);
					return queuedResponses.shift() ?? { rows: [] };
				},
				update: (table: unknown) => ({
					set: (values: Record<string, unknown>) => ({
						where: async (clause: unknown) => {
							calls.push({ type: "update", table, values, clause });
							return queuedResponses.shift() ?? { rows: [] };
						},
					}),
				}),
			}),
	} as unknown as PGDB;

	return { db, calls };
}

describe("evaluateAPIKeyRateLimit", () => {
	test("allows the first request in a window", () => {
		const now = new Date("2026-04-16T00:00:00.000Z");
		const result = evaluateAPIKeyRateLimit(baseRow, now);

		expect(result).toEqual({
			allowed: true,
			lastRequest: now,
			requestCount: 1,
			retryAfterMs: null,
		});
	});

	test("increments requests within the same window", () => {
		const now = new Date("2026-04-16T00:00:30.000Z");
		const result = evaluateAPIKeyRateLimit(
			{
				...baseRow,
				requestCount: 1,
				lastRequest: new Date("2026-04-16T00:00:00.000Z"),
			},
			now,
		);

		expect(result).toEqual({
			allowed: true,
			lastRequest: now,
			requestCount: 2,
			retryAfterMs: null,
		});
	});

	test("resets the counter after the window elapses", () => {
		const now = new Date("2026-04-16T00:01:01.000Z");
		const result = evaluateAPIKeyRateLimit(
			{
				...baseRow,
				requestCount: 2,
				lastRequest: new Date("2026-04-16T00:00:00.000Z"),
			},
			now,
		);

		expect(result).toEqual({
			allowed: true,
			lastRequest: now,
			requestCount: 1,
			retryAfterMs: null,
		});
	});

	test("rejects requests once the window quota is exhausted", () => {
		const now = new Date("2026-04-16T00:00:10.000Z");
		const result = evaluateAPIKeyRateLimit(
			{
				...baseRow,
				requestCount: 2,
				lastRequest: new Date("2026-04-16T00:00:00.000Z"),
			},
			now,
		);

		expect(result).toEqual({
			allowed: false,
			lastRequest: new Date("2026-04-16T00:00:00.000Z"),
			requestCount: 2,
			retryAfterMs: 50_000,
		});
	});

	test("skips counter increments when per-key limits are disabled", () => {
		const now = new Date("2026-04-16T00:00:10.000Z");
		const result = evaluateAPIKeyRateLimit(
			{
				...baseRow,
				rateLimitEnabled: false,
				requestCount: 12,
				lastRequest: new Date("2026-04-16T00:00:00.000Z"),
			},
			now,
		);

		expect(result).toEqual({
			allowed: true,
			lastRequest: now,
			requestCount: 12,
			retryAfterMs: null,
		});
	});
});

describe("verifyAndConsumeAPIKey", () => {
	test("returns unauthorized when the API key does not exist", async () => {
		const { db, calls } = buildFakeDB([{ rows: [] }]);

		const result = await verifyAndConsumeAPIKey(db, "missing-key");

		expect(result).toEqual({
			ok: false,
			status: 401,
			message: "Unauthorized",
		});
		expect(calls).toHaveLength(1);
	});

	test("updates request bookkeeping for an allowed request", async () => {
		const { db, calls } = buildFakeDB([
			{ rows: [{ ...baseRow }] },
			{ rows: [] },
		]);

		const result = await verifyAndConsumeAPIKey(db, "valid-key");

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.apiKey.id).toBe(baseRow.id);
			expect(result.apiKey.organizationId).toBe(baseRow.organizationId);
		}
		expect(calls).toHaveLength(2);
	});

	test("returns 429 without updating the record when the key is over limit", async () => {
		const { db, calls } = buildFakeDB([
			{
				rows: [
					{
						...baseRow,
						requestCount: 2,
						lastRequest: new Date("2026-04-16T00:00:00.000Z"),
					},
				],
			},
		]);

		const result = await verifyAndConsumeAPIKey(
			db,
			"limited-key",
			new Date("2026-04-16T00:00:10.000Z"),
		);

		expect(result).toEqual({
			ok: false,
			status: 429,
			message: "Rate limit exceeded",
			retryAfterSeconds: 50,
		});
		expect(calls).toHaveLength(1);
	});
});

describe("verifyAndConsumeAPIKeyForDebugMode", () => {
	test("updates usage for a matching key without rate-limit enforcement", async () => {
		const { db, calls } = buildFakeDB([
			{
				rows: [
					{
						...baseRow,
						requestCount: 12,
						lastRequest: new Date("2026-04-16T00:00:00.000Z"),
					},
				],
			},
			{ rows: [] },
		]);

		const result = await verifyAndConsumeAPIKeyForDebugMode(
			db,
			"debug-key",
			new Date("2026-04-16T00:00:10.000Z"),
		);

		expect(result?.id).toBe(baseRow.id);
		expect(calls).toHaveLength(2);
	});

	test("still returns disabled keys in debug mode so local dev flows keep working", async () => {
		const { db, calls } = buildFakeDB([
			{
				rows: [
					{
						...baseRow,
						enabled: false,
					},
				],
			},
			{ rows: [] },
		]);

		const result = await verifyAndConsumeAPIKeyForDebugMode(db, "debug-key");

		expect(result?.id).toBe(baseRow.id);
		expect(calls).toHaveLength(2);
	});
});
