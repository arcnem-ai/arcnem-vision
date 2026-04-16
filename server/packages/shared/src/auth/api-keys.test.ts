import { describe, expect, test } from "bun:test";
import {
	DEFAULT_SERVICE_API_KEY_PERMISSIONS,
	DEFAULT_WORKFLOW_API_KEY_PERMISSIONS,
	getDefaultAPIKeyPermissions,
	resolveAPIKeyPermissions,
} from "./api-keys";

describe("API key permissions", () => {
	test("returns different defaults for workflow and service keys", () => {
		expect(getDefaultAPIKeyPermissions("workflow")).toEqual(
			DEFAULT_WORKFLOW_API_KEY_PERMISSIONS,
		);
		expect(getDefaultAPIKeyPermissions("service")).toEqual(
			DEFAULT_SERVICE_API_KEY_PERMISSIONS,
		);
		expect(DEFAULT_WORKFLOW_API_KEY_PERMISSIONS.workflows).toBeUndefined();
		expect(DEFAULT_SERVICE_API_KEY_PERMISSIONS.workflows).toEqual([
			"execute",
			"read",
		]);
	});

	test("falls back to defaults when the stored payload is missing or malformed", () => {
		expect(resolveAPIKeyPermissions(null, "service")).toEqual(
			DEFAULT_SERVICE_API_KEY_PERMISSIONS,
		);
		expect(resolveAPIKeyPermissions("not json", "workflow")).toEqual(
			DEFAULT_WORKFLOW_API_KEY_PERMISSIONS,
		);
		expect(
			resolveAPIKeyPermissions(JSON.stringify(["bad"]), "workflow"),
		).toEqual(DEFAULT_WORKFLOW_API_KEY_PERMISSIONS);
		expect(
			resolveAPIKeyPermissions(
				JSON.stringify({
					uploads: ["presign"],
					documents: ["read"],
					workflows: ["execute"],
				}),
				"workflow",
			),
		).toEqual({
			uploads: ["presign"],
			documents: ["read"],
			workflows: ["execute"],
		});
	});

	test("keeps valid arrays and filters empty actions", () => {
		expect(
			resolveAPIKeyPermissions(
				JSON.stringify({
					uploads: ["presign", "", "ack"],
					documents: ["read", "visibility"],
				}),
				"service",
			),
		).toEqual({
			uploads: ["presign", "ack"],
			documents: ["read", "visibility"],
			workflows: ["execute", "read"],
		});
	});
});
