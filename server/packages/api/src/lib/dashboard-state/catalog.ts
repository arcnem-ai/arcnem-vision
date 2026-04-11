import type { PGDB } from "@arcnem-vision/db/server";
import { toToolOption } from "./serializers";

export async function loadDashboardCatalog(db: PGDB) {
	const modelRows = await db.query.models.findMany({
		columns: {
			id: true,
			provider: true,
			name: true,
			type: true,
		},
		orderBy: (row, { asc }) => [asc(row.provider), asc(row.name)],
	});
	const toolRows = await db.query.tools.findMany({
		columns: {
			id: true,
			name: true,
			description: true,
			inputSchema: true,
			outputSchema: true,
		},
		orderBy: (row, { asc }) => [asc(row.name)],
	});

	const modelCatalog = modelRows.map((model) => ({
		id: model.id,
		provider: model.provider,
		name: model.name,
		type: model.type,
		label: `${model.provider} / ${model.name}`,
	}));
	const modelLabelById = new Map(
		modelCatalog.map((model) => [model.id, model.label] as const),
	);
	const toolCatalog = toolRows.map((tool) => toToolOption(tool));
	const toolOptionById = new Map(
		toolCatalog.map((tool) => [tool.id, tool] as const),
	);

	return {
		modelCatalog,
		modelLabelById,
		toolCatalog,
		toolOptionById,
	};
}
