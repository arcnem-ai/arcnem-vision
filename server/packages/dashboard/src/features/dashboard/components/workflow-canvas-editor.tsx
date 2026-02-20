import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowCanvasStage } from "@/features/dashboard/components/workflow-canvas/canvas-stage";
import { WorkflowCanvasInspector } from "@/features/dashboard/components/workflow-canvas/inspector";
import { WorkflowCanvasSidebar } from "@/features/dashboard/components/workflow-canvas/sidebar";
import { useWorkflowCanvasEditorState } from "@/features/dashboard/components/workflow-canvas/use-editor-state";
import type {
	DashboardData,
	StatusMessage,
	WorkflowDraft,
} from "@/features/dashboard/types";

export function WorkflowCanvasEditor({
	isOpen,
	workflow,
	modelCatalog,
	toolCatalog,
	saveMessage,
	creatingWorkflow,
	updatingWorkflowId,
	onClose,
	onCreateWorkflow,
	onUpdateWorkflow,
}: {
	isOpen: boolean;
	workflow: DashboardData["workflows"][number] | null;
	modelCatalog: DashboardData["modelCatalog"];
	toolCatalog: DashboardData["toolCatalog"];
	saveMessage: StatusMessage | null;
	creatingWorkflow: boolean;
	updatingWorkflowId: string | null;
	onClose: () => void;
	onCreateWorkflow: (draft: WorkflowDraft) => Promise<void>;
	onUpdateWorkflow: (workflowId: string, draft: WorkflowDraft) => Promise<void>;
}) {
	const {
		canvasRef,
		viewport,
		name,
		description,
		entryNode,
		nodes,
		edges,
		edgeDraft,
		edgeHoverNodeKey,
		selectedNodeId,
		selectedNode,
		localError,
		nodeValidationMessage,
		setName,
		setDescription,
		setEntryNode,
		addNode,
		removeNode,
		updateSelectedNode,
		removeEdge,
		addEdgeToEnd,
		startNodeDrag,
		startPan,
		startEdgeDrag,
		setEdgeHoverTarget,
		onCanvasWheel,
		zoomIn,
		zoomOut,
		resetView,
		saveGraph,
	} = useWorkflowCanvasEditorState({
		isOpen,
		workflow,
		modelCatalog,
		toolCatalog,
		onCreateWorkflow,
		onUpdateWorkflow,
		onClose,
	});

	if (!isOpen) return null;

	const isSaving = workflow
		? updatingWorkflowId === workflow.id
		: creatingWorkflow;

	return (
		<div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm">
			<div className="absolute inset-3 overflow-hidden rounded-2xl border border-slate-200/70 bg-[linear-gradient(150deg,#fffdf5_0%,#f5fbff_65%,#f3fff9_100%)] shadow-[0_20px_80px_rgba(2,6,23,0.5)]">
				<div className="flex items-center justify-between border-b border-slate-900/10 bg-white/75 px-4 py-3 backdrop-blur">
					<div className="flex items-center gap-2">
						<Badge className="rounded-full bg-slate-900 text-white hover:bg-slate-900">
							Canvas Editor
						</Badge>
						<span className="text-sm font-medium text-slate-700">
							{workflow ? "Editing workflow graph" : "Create workflow graph"}
						</span>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={onClose}
						disabled={isSaving}
					>
						<X className="size-4" />
					</Button>
				</div>

				<div className="grid h-[calc(100%-57px)] gap-0 lg:grid-cols-[260px_1fr_320px]">
					<WorkflowCanvasSidebar
						nodesCount={nodes.length}
						edgesCount={edges.length}
						entryNode={entryNode}
						onAddNode={addNode}
					/>

					<WorkflowCanvasStage
						canvasRef={canvasRef}
						nodes={nodes}
						edges={edges}
						edgeDraft={edgeDraft}
						edgeHoverNodeKey={edgeHoverNodeKey}
						viewport={viewport}
						selectedNodeId={selectedNodeId}
						onStartNodeDrag={startNodeDrag}
						onStartEdgeDrag={startEdgeDrag}
						onSetEdgeHoverTarget={setEdgeHoverTarget}
						onStartPan={startPan}
						onCanvasWheel={onCanvasWheel}
						onZoomIn={zoomIn}
						onZoomOut={zoomOut}
						onResetView={resetView}
						onRemoveNode={removeNode}
					/>

					<WorkflowCanvasInspector
						name={name}
						description={description}
						entryNode={entryNode}
						nodes={nodes}
						edges={edges}
						saveMessage={saveMessage}
						localError={localError}
						isSaving={isSaving}
						nodeValidationMessage={nodeValidationMessage}
						selectedNode={selectedNode}
						modelCatalog={modelCatalog}
						toolCatalog={toolCatalog}
						onChangeName={setName}
						onChangeDescription={setDescription}
						onChangeEntryNode={setEntryNode}
						onChangeSelectedNode={updateSelectedNode}
						onRemoveEdge={removeEdge}
						onAddEdgeToEnd={addEdgeToEnd}
						onSave={saveGraph}
						onCancel={onClose}
					/>
				</div>
			</div>
		</div>
	);
}
