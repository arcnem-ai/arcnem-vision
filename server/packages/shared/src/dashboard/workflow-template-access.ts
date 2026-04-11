import type { schema } from "@arcnem-vision/db";
import { eq, or } from "drizzle-orm";
import { normalizeWorkflowTemplateVisibility } from "./workflow-template-utils";

type WorkflowTemplateAccessRow = Pick<
	typeof schema.agentGraphTemplates,
	"organizationId" | "visibility"
>;

export function buildWorkflowTemplateAccessCondition(
	row: WorkflowTemplateAccessRow,
	organizationId: string,
) {
	return or(
		eq(row.organizationId, organizationId),
		eq(row.visibility, "public"),
	);
}

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
