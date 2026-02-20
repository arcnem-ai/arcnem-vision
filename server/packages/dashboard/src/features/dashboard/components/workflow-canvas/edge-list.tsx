export function WorkflowEdgeList({
	edges,
	onRemoveEdge,
}: {
	edges: Array<{ fromNode: string; toNode: string }>;
	onRemoveEdge: (edgeKey: string) => void;
}) {
	const edgeList = edges.map((edge) => ({
		key: `${edge.fromNode}->${edge.toNode}`,
		...edge,
	}));

	return (
		<div className="space-y-2">
			<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Edges
			</p>
			{edgeList.length === 0 ? (
				<p className="text-sm text-slate-500">No edges yet.</p>
			) : (
				edgeList.map((edge) => (
					<div
						key={edge.key}
						className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
					>
						<span className="truncate">
							{edge.fromNode} → {edge.toNode}
						</span>
						<button
							type="button"
							className="rounded border border-slate-300 px-2 py-0.5 text-xs"
							onClick={() => onRemoveEdge(edge.key)}
						>
							Remove
						</button>
					</div>
				))
			)}
		</div>
	);
}
