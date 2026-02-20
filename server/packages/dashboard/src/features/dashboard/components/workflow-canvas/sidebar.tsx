import { Button } from "@/components/ui/button";

export function WorkflowCanvasSidebar({
	nodesCount,
	edgesCount,
	entryNode,
	onAddNode,
}: {
	nodesCount: number;
	edgesCount: number;
	entryNode: string;
	onAddNode: (nodeType: string) => void;
}) {
	return (
		<div className="border-r border-slate-900/10 bg-white/70 p-4">
			<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Node Palette
			</p>
			<div className="mt-3 grid gap-2">
				<Button
					type="button"
					variant="outline"
					className="justify-start"
					onClick={() => onAddNode("worker")}
				>
					+ Worker node
				</Button>
				<Button
					type="button"
					variant="outline"
					className="justify-start"
					onClick={() => onAddNode("supervisor")}
				>
					+ Supervisor node
				</Button>
				<Button
					type="button"
					variant="outline"
					className="justify-start"
					onClick={() => onAddNode("tool")}
				>
					+ Tool node
				</Button>
			</div>

			<div className="mt-6">
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
					Live Stats
				</p>
				<div className="mt-2 grid gap-2 text-sm text-slate-700">
					<div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
						Nodes: {nodesCount}
					</div>
					<div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
						Edges: {edgesCount}
					</div>
					<div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
						Entry: {entryNode || "n/a"}
					</div>
				</div>
			</div>
		</div>
	);
}
