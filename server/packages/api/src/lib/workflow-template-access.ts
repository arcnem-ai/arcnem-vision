import type { schema } from "@arcnem-vision/db";
import { eq, or } from "drizzle-orm";

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
