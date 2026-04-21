import type { PGDB } from "@arcnem-vision/db/server";

export async function findActiveWorkflowById(
	db: PGDB,
	organizationId: string,
	workflowId: string,
) {
	return db.query.agentGraphs.findFirst({
		where: (row, { and, eq, isNull }) =>
			and(
				eq(row.id, workflowId),
				eq(row.organizationId, organizationId),
				isNull(row.archivedAt),
			),
		columns: {
			id: true,
			name: true,
		},
	});
}
