import { normalizeWorkflowTemplateVisibility } from "./workflow-template-utils";

export function isWorkflowTemplateAccessible(input: {
	activeOrganizationId: string;
	templateOrganizationId: string | null;
	templateVisibility: string;
}) {
	return (
		input.templateOrganizationId === input.activeOrganizationId ||
		normalizeWorkflowTemplateVisibility(input.templateVisibility) === "public"
	);
}
