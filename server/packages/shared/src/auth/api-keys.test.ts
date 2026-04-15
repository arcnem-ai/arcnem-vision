import { describe, expect, test } from "bun:test";
import {
	DEFAULT_DEVICE_API_KEY_PERMISSIONS,
	DEFAULT_SERVICE_API_KEY_PERMISSIONS,
	getDefaultAPIKeyPermissions,
	resolveAPIKeyPermissions,
} from "./api-keys";

describe("API key permissions", () => {
	test("returns different defaults for device and service keys", () => {
		expect(getDefaultAPIKeyPermissions("device")).toEqual(
			DEFAULT_DEVICE_API_KEY_PERMISSIONS,
		);
		expect(getDefaultAPIKeyPermissions("service")).toEqual(
			DEFAULT_SERVICE_API_KEY_PERMISSIONS,
		);
		expect(DEFAULT_DEVICE_API_KEY_PERMISSIONS.workflows).toBeUndefined();
		expect(DEFAULT_SERVICE_API_KEY_PERMISSIONS.workflows).toEqual([
			"execute",
			"read",
		]);
	});

	test("falls back to defaults when the stored payload is missing or malformed", () => {
		expect(resolveAPIKeyPermissions(null, "service")).toEqual(
			DEFAULT_SERVICE_API_KEY_PERMISSIONS,
		);
		expect(resolveAPIKeyPermissions("not json", "device")).toEqual(
			DEFAULT_DEVICE_API_KEY_PERMISSIONS,
		);
		expect(resolveAPIKeyPermissions(JSON.stringify(["bad"]), "device")).toEqual(
			DEFAULT_DEVICE_API_KEY_PERMISSIONS,
		);
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
