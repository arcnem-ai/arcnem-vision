import { X } from "lucide-react";
import type { PointerEvent, RefObject, WheelEvent } from "react";
import { cn } from "@/lib/utils";
import {
	CANVAS_NODE_HEIGHT,
	CANVAS_NODE_WIDTH,
	type EditorNode,
	getNodeTypeTone,
} from "./shared";

const END_NODE_KEY = "END";
const END_NODE_WIDTH = 120;
const END_NODE_HEIGHT = 72;

type Viewport = {
	scale: number;
	offsetX: number;
	offsetY: number;
};

type EdgeDraft = {
	fromNodeKey: string;
	toX: number;
	toY: number;
};

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function WorkflowCanvasStage({
	canvasRef,
	nodes,
	edges,
	edgeDraft,
	edgeHoverNodeKey,
	viewport,
	selectedNodeId,
	onStartNodeDrag,
	onStartEdgeDrag,
	onSetEdgeHoverTarget,
	onStartPan,
	onCanvasWheel,
	onZoomIn,
	onZoomOut,
	onResetView,
	onRemoveNode,
}: {
	canvasRef: RefObject<HTMLDivElement | null>;
	nodes: EditorNode[];
	edges: Array<{ fromNode: string; toNode: string }>;
	edgeDraft: EdgeDraft | null;
	edgeHoverNodeKey: string | null;
	viewport: Viewport;
	selectedNodeId: string | null;
	onStartNodeDrag: (
		event: PointerEvent<HTMLDivElement>,
		node: EditorNode,
	) => void;
	onStartEdgeDrag: (
		fromNodeKey: string,
		event: PointerEvent<HTMLButtonElement>,
	) => void;
	onSetEdgeHoverTarget: (nodeKey: string | null) => void;
	onStartPan: (event: PointerEvent<HTMLDivElement>) => void;
	onCanvasWheel: (event: WheelEvent<HTMLDivElement>) => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onResetView: () => void;
	onRemoveNode: (nodeId: string) => void;
}) {
	const nodeByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
	const supervisors = nodes.filter((node) => node.nodeType === "supervisor");
	const workers = nodes.filter((node) => node.nodeType === "worker");
	const workerByKey = new Map(
		workers.map((worker) => [worker.nodeKey, worker]),
	);

	const orchestrationLinks = supervisors.flatMap((supervisor) => {
		const configuredMembers = asStringArray(supervisor.config.members)
			.map((nodeKey) => workerByKey.get(nodeKey))
			.filter((worker): worker is EditorNode => Boolean(worker));

		return configuredMembers.map((worker, index) => {
			const fromX = supervisor.x + CANVAS_NODE_WIDTH / 2;
			const fromY = supervisor.y + CANVAS_NODE_HEIGHT / 2;
			const toX = worker.x + CANVAS_NODE_WIDTH / 2;
			const toY = worker.y + CANVAS_NODE_HEIGHT / 2;
			const baseX = (fromX + toX) / 2;
			const baseY = (fromY + toY) / 2;
			const curveDirection = fromX <= toX ? 1 : -1;
			const curveOffset = 90 + (index % 3) * 22;
			const controlX = baseX + curveDirection * curveOffset;
			const controlY = baseY - curveOffset * 0.34;

			return {
				key: `${supervisor.nodeKey}->${worker.nodeKey}`,
				fromNodeKey: supervisor.nodeKey,
				toNodeKey: worker.nodeKey,
				fromX,
				fromY,
				toX,
				toY,
				controlX,
				controlY,
			};
		});
	});

	const orchestrationCountBySupervisorKey = new Map<string, number>();
	for (const link of orchestrationLinks) {
		const previous =
			orchestrationCountBySupervisorKey.get(link.fromNodeKey) ?? 0;
		orchestrationCountBySupervisorKey.set(link.fromNodeKey, previous + 1);
	}
	const maxNodeX =
		nodes.length > 0
			? Math.max(...nodes.map((node) => node.x + CANVAS_NODE_WIDTH))
			: 380;
	const avgNodeY =
		nodes.length > 0
			? nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length
			: 200;
	const endNodeX = maxNodeX + 240;
	const endNodeY = Math.max(80, Math.round(avgNodeY));

	const canvasEdges = edges
		.map((edge) => {
			const fromNode = nodeByKey.get(edge.fromNode);
			if (!fromNode) return null;
			const toNode =
				edge.toNode === END_NODE_KEY ? null : nodeByKey.get(edge.toNode);
			if (!toNode && edge.toNode !== END_NODE_KEY) return null;
			return {
				key: `${edge.fromNode}->${edge.toNode}`,
				x1: fromNode.x + CANVAS_NODE_WIDTH / 2,
				y1: fromNode.y + CANVAS_NODE_HEIGHT / 2,
				x2:
					edge.toNode === END_NODE_KEY
						? endNodeX + END_NODE_WIDTH / 2
						: (toNode?.x ?? 0) + CANVAS_NODE_WIDTH / 2,
				y2:
					edge.toNode === END_NODE_KEY
						? endNodeY + END_NODE_HEIGHT / 2
						: (toNode?.y ?? 0) + CANVAS_NODE_HEIGHT / 2,
			};
		})
		.filter(Boolean);

	const draftSourceNode = edgeDraft
		? (nodes.find((node) => node.nodeKey === edgeDraft.fromNodeKey) ?? null)
		: null;

	return (
		<div className="relative overflow-hidden">
			<div
				ref={canvasRef}
				onPointerDown={onStartPan}
				onWheel={onCanvasWheel}
				className="relative h-full w-full cursor-grab bg-[linear-gradient(rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:28px_28px] active:cursor-grabbing"
			>
				<div
					className="pointer-events-none absolute left-0 top-0"
					style={{
						transformOrigin: "0 0",
						transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
					}}
				>
					<svg
						className="pointer-events-none absolute left-0 top-0"
						width={4000}
						height={2600}
					>
						<title>Workflow canvas edges</title>
						<defs>
							<marker
								id="edge-arrow"
								viewBox="0 0 10 10"
								refX="9"
								refY="5"
								markerWidth="6"
								markerHeight="6"
								orient="auto-start-reverse"
							>
								<path d="M 0 0 L 10 5 L 0 10 z" fill="#0f172a" opacity="0.55" />
							</marker>
							<marker
								id="orchestration-arrow"
								viewBox="0 0 10 10"
								refX="9"
								refY="5"
								markerWidth="6"
								markerHeight="6"
								orient="auto-start-reverse"
							>
								<path d="M 0 0 L 10 5 L 0 10 z" fill="#0369a1" opacity="0.6" />
							</marker>
						</defs>
						{orchestrationLinks.map((link) => (
							<path
								key={`orchestrate-${link.key}`}
								d={`M ${link.fromX} ${link.fromY} Q ${link.controlX} ${link.controlY} ${link.toX} ${link.toY}`}
								stroke="#0369a1"
								strokeOpacity={0.35}
								strokeWidth={1.8}
								strokeDasharray="5 5"
								fill="none"
								markerEnd="url(#orchestration-arrow)"
							/>
						))}
						{canvasEdges.map((edge) =>
							edge ? (
								<line
									key={edge.key}
									x1={edge.x1}
									y1={edge.y1}
									x2={edge.x2}
									y2={edge.y2}
									stroke="#0f172a"
									strokeOpacity="0.45"
									strokeWidth="2"
									markerEnd="url(#edge-arrow)"
								/>
							) : null,
						)}
						{edgeDraft && draftSourceNode ? (
							<line
								x1={draftSourceNode.x + CANVAS_NODE_WIDTH / 2}
								y1={draftSourceNode.y + CANVAS_NODE_HEIGHT / 2}
								x2={edgeDraft.toX}
								y2={edgeDraft.toY}
								stroke="#0369a1"
								strokeOpacity="0.8"
								strokeWidth="2"
								strokeDasharray="6 5"
								markerEnd="url(#edge-arrow)"
							/>
						) : null}
					</svg>

					{nodes.map((node) => (
						<div
							key={node.localId}
							onPointerDown={(event) => onStartNodeDrag(event, node)}
							onPointerEnter={() => onSetEdgeHoverTarget(node.nodeKey)}
							onPointerLeave={() => onSetEdgeHoverTarget(null)}
							className={cn(
								"pointer-events-auto absolute select-none rounded-xl border p-3 shadow-sm transition",
								getNodeTypeTone(node.nodeType),
								selectedNodeId === node.localId
									? "ring-2 ring-slate-900/40"
									: "hover:ring-1 hover:ring-slate-900/30",
								edgeHoverNodeKey === node.nodeKey && edgeDraft
									? "ring-2 ring-sky-500"
									: "",
							)}
							style={{
								width: CANVAS_NODE_WIDTH,
								height: CANVAS_NODE_HEIGHT,
								left: node.x,
								top: node.y,
							}}
						>
							<button
								type="button"
								className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-slate-500 bg-white"
								title="Edge target"
								onPointerDown={(event) => event.stopPropagation()}
							/>
							<button
								type="button"
								className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900"
								title="Drag to connect"
								onPointerDown={(event) => onStartEdgeDrag(node.nodeKey, event)}
							/>
							<div className="flex items-start justify-between gap-2">
								<div>
									<p className="truncate text-sm font-semibold">
										{node.nodeKey}
									</p>
									<p className="text-xs opacity-70">{node.nodeType}</p>
								</div>
								<button
									type="button"
									aria-label={`Delete node ${node.nodeKey}`}
									className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white/85 text-slate-500 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
									onPointerDown={(event) => {
										event.stopPropagation();
									}}
									onClick={(event) => {
										event.stopPropagation();
										onRemoveNode(node.localId);
									}}
								>
									<X className="h-3.5 w-3.5" />
								</button>
							</div>
							{node.nodeType === "supervisor" ? (
								<p className="mt-2 text-[11px] font-semibold text-sky-700/80">
									Orchestrates{" "}
									{orchestrationCountBySupervisorKey.get(node.nodeKey) ?? 0}{" "}
									workers
								</p>
							) : null}
							{node.toolNames.length > 0 ? (
								<p className="mt-2 truncate text-[11px] opacity-80">
									Tools: {node.toolNames.join(", ")}
								</p>
							) : (
								<p className="mt-2 text-[11px] opacity-60">
									Drag to reposition
								</p>
							)}
						</div>
					))}

					<div
						onPointerEnter={() => onSetEdgeHoverTarget(END_NODE_KEY)}
						onPointerLeave={() => onSetEdgeHoverTarget(null)}
						className={cn(
							"pointer-events-auto absolute rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-white shadow-sm transition",
							edgeHoverNodeKey === END_NODE_KEY && edgeDraft
								? "ring-2 ring-sky-500"
								: "hover:ring-1 hover:ring-slate-900/40",
						)}
						style={{
							width: END_NODE_WIDTH,
							height: END_NODE_HEIGHT,
							left: endNodeX,
							top: endNodeY,
						}}
					>
						<p className="text-sm font-semibold">END</p>
						<p className="text-[11px] opacity-70">Terminal state</p>
					</div>
				</div>

				<div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-slate-300 bg-white/90 p-1 text-xs">
					<button
						type="button"
						className="rounded border border-slate-300 px-2 py-1"
						onClick={onZoomOut}
					>
						-
					</button>
					<button
						type="button"
						className="min-w-16 rounded border border-slate-200 px-2 py-1"
						onClick={onResetView}
					>
						{Math.round(viewport.scale * 100)}%
					</button>
					<button
						type="button"
						className="rounded border border-slate-300 px-2 py-1"
						onClick={onZoomIn}
					>
						+
					</button>
				</div>
			</div>
		</div>
	);
}
