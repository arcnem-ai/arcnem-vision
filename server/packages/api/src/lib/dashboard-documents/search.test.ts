import { describe, expect, test } from "bun:test";
import { buildDashboardDocumentSearchScope } from "./search";

describe("buildDashboardDocumentSearchScope", () => {
	test("includes project filters in MCP scope", () => {
		expect(
			buildDashboardDocumentSearchScope("org-1", {
				projectId: "project-1",
			}),
		).toEqual({
			organization_id: "org-1",
			project_ids: ["project-1"],
		});
	});

	test("includes api key filters in MCP scope", () => {
		expect(
			buildDashboardDocumentSearchScope("org-1", {
				apiKeyId: "key-1",
			}),
		).toEqual({
			organization_id: "org-1",
			api_key_ids: ["key-1"],
		});
	});

	test("includes dashboard-upload filtering in MCP scope", () => {
		expect(
			buildDashboardDocumentSearchScope("org-1", {
				projectId: "project-1",
				dashboardUploadsOnly: true,
			}),
		).toEqual({
			organization_id: "org-1",
			project_ids: ["project-1"],
			dashboard_uploads_only: true,
		});
	});
});
