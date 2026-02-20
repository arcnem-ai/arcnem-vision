import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type {
	StatusMessage,
	WorkflowModelOption,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import { cn } from "@/lib/utils";
import { WorkflowEdgeList } from "./edge-list";
import { SelectedNodePanel } from "./selected-node-panel";
import type { EditorNode } from "./shared";

export function WorkflowCanvasInspector({
	name,
	description,
	entryNode,
	nodes,
	edges,
	saveMessage,
	localError,
	isSaving,
	nodeValidationMessage,
	selectedNode,
	modelCatalog,
	toolCatalog,
	onChangeName,
	onChangeDescription,
	onChangeEntryNode,
	onChangeSelectedNode,
	onRemoveEdge,
	onAddEdgeToEnd,
	onSave,
	onCancel,
}: {
	name: string;
	description: string;
	entryNode: string;
	nodes: EditorNode[];
	edges: Array<{ fromNode: string; toNode: string }>;
	saveMessage: StatusMessage | null;
	localError: string | null;
	isSaving: boolean;
	nodeValidationMessage: string | null;
	selectedNode: EditorNode | null;
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
	onChangeName: (value: string) => void;
	onChangeDescription: (value: string) => void;
	onChangeEntryNode: (value: string) => void;
	onChangeSelectedNode: (changes: Partial<EditorNode>) => void;
	onRemoveEdge: (edgeKey: string) => void;
	onAddEdgeToEnd: (fromNode: string) => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="overflow-y-auto border-l border-slate-900/10 bg-white/80 p-4">
			<div className="space-y-3">
				<h3 className="font-display text-lg text-slate-900">Inspector</h3>
				{localError ? (
					<div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
						{localError}
					</div>
				) : null}
				{saveMessage ? (
					<div
						className={cn(
							"rounded-lg px-3 py-2 text-sm",
							saveMessage.tone === "success"
								? "border border-emerald-200 bg-emerald-50 text-emerald-800"
								: "border border-rose-200 bg-rose-50 text-rose-800",
						)}
					>
						{saveMessage.text}
					</div>
				) : null}

				<div>
					<label
						htmlFor="canvas-workflow-name"
						className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
					>
						Workflow name
					</label>
					<Input
						id="canvas-workflow-name"
						value={name}
						onChange={(event) => onChangeName(event.target.value)}
						placeholder="Workflow name"
					/>
				</div>

				<div>
					<label
						htmlFor="canvas-workflow-description"
						className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
					>
						Description
					</label>
					<textarea
						id="canvas-workflow-description"
						value={description}
						onChange={(event) => onChangeDescription(event.target.value)}
						rows={3}
						className="w-full rounded-md border border-slate-900/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900/40 focus:ring-2 focus:ring-sky-200"
					/>
				</div>

				<div>
					<p className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
						Entry node
					</p>
					<Select value={entryNode} onValueChange={onChangeEntryNode}>
						<SelectTrigger>
							<SelectValue placeholder="Select entry node" />
						</SelectTrigger>
						<SelectContent>
							{nodes.map((node) => (
								<SelectItem key={node.localId} value={node.nodeKey}>
									{node.nodeKey}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<hr className="border-slate-200" />

				{selectedNode ? (
					<SelectedNodePanel
						selectedNode={selectedNode}
						nodes={nodes}
						modelCatalog={modelCatalog}
						toolCatalog={toolCatalog}
						onChangeSelectedNode={onChangeSelectedNode}
						onAddEdgeToEnd={onAddEdgeToEnd}
					/>
				) : (
					<p className="text-sm text-slate-500">
						Select a node on the canvas to edit its properties.
					</p>
				)}

				<hr className="border-slate-200" />

				<WorkflowEdgeList edges={edges} onRemoveEdge={onRemoveEdge} />

				<div className="mt-4 flex gap-2">
					<Button type="button" onClick={onSave} disabled={isSaving}>
						{isSaving ? "Saving..." : "Save workflow"}
					</Button>
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
				</div>
				{nodeValidationMessage ? (
					<p className="text-xs text-slate-500">{nodeValidationMessage}</p>
				) : null}
				<Badge variant="outline" className="mt-2">
					Live editor
				</Badge>
			</div>
		</div>
	);
}
