import { describe, expect, test } from "bun:test";
import { isWorkflowTemplateAccessible } from "./workflow-template-access";

describe("isWorkflowTemplateAccessible", () => {
	test("allows templates owned by the active organization", () => {
		expect(
			isWorkflowTemplateAccessible({
				activeOrganizationId: "org-a",
				templateOrganizationId: "org-a",
				templateVisibility: "organization",
			}),
		).toBe(true);
	});

	test("allows public templates owned by another organization", () => {
		expect(
			isWorkflowTemplateAccessible({
				activeOrganizationId: "org-b",
				templateOrganizationId: "org-a",
				templateVisibility: "public",
			}),
		).toBe(true);
	});

	test("allows global public templates", () => {
		expect(
			isWorkflowTemplateAccessible({
				activeOrganizationId: "org-b",
				templateOrganizationId: null,
				templateVisibility: "public",
			}),
		).toBe(true);
	});

	test("blocks non-public templates from other organizations", () => {
		expect(
			isWorkflowTemplateAccessible({
				activeOrganizationId: "org-b",
				templateOrganizationId: "org-a",
				templateVisibility: "organization",
			}),
		).toBe(false);
	});
});
