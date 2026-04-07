import { describe, expect, test } from "bun:test";
import {
	buildWorkflowNameFromTemplate,
	normalizeWorkflowTemplateVisibility,
} from "./workflow-template-utils";

describe("buildWorkflowNameFromTemplate", () => {
	test("returns the template name when it is unused", () => {
		expect(
			buildWorkflowNameFromTemplate("OCR Review Supervisor", [
				"Document Processing Pipeline",
			]),
		).toBe("OCR Review Supervisor");
	});

	test("adds an incrementing suffix when the base name already exists", () => {
		expect(
			buildWorkflowNameFromTemplate("Document Processing Pipeline", [
				"Document Processing Pipeline",
			]),
		).toBe("Document Processing Pipeline 2");
	});

	test("fills the first available numeric suffix", () => {
		expect(
			buildWorkflowNameFromTemplate("Image Quality Review", [
				"Image Quality Review",
				"Image Quality Review 2",
				"Image Quality Review 4",
			]),
		).toBe("Image Quality Review 3");
	});

	test("normalizes unknown visibility values to organization", () => {
		expect(normalizeWorkflowTemplateVisibility("internal")).toBe(
			"organization",
		);
		expect(normalizeWorkflowTemplateVisibility(null)).toBe("organization");
	});

	test("keeps public visibility when requested", () => {
		expect(normalizeWorkflowTemplateVisibility("public")).toBe("public");
		expect(normalizeWorkflowTemplateVisibility(" PUBLIC ")).toBe("public");
	});
});
