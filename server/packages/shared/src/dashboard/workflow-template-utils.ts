import type { WorkflowTemplateVisibility } from "../contracts/dashboard";

export function buildWorkflowNameFromTemplate(
	templateName: string,
	existingWorkflowNames: string[],
) {
	const baseName = templateName.trim() || "Untitled Workflow";
	const takenNames = new Set(
		existingWorkflowNames.map((name) => name.trim()).filter(Boolean),
	);

	if (!takenNames.has(baseName)) {
		return baseName;
	}

	let suffix = 2;
	while (takenNames.has(`${baseName} ${suffix}`)) {
		suffix += 1;
	}

	return `${baseName} ${suffix}`;
}

export function normalizeWorkflowTemplateVisibility(
	value: string | null | undefined,
): WorkflowTemplateVisibility {
	return value?.trim().toLowerCase() === "public" ? "public" : "organization";
}
