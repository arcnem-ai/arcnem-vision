import type {
	PointerEvent as ReactPointerEvent,
	WheelEvent as ReactWheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	DashboardData,
	WorkflowDraft,
	WorkflowModelOption,
	WorkflowNodeConfig,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import {
	type EditorNode,
	initialDraftFromWorkflow,
	makeLocalId,
} from "./shared";
import { buildUniqueNodeKey, validateCanvasGraph } from "./state-utils";

type CanvasViewport = {
	scale: number;
	offsetX: number;
	offsetY: number;
};

type EdgeDraft = {
	fromNodeKey: string;
	toX: number;
	toY: number;
};

function clampScale(nextScale: number) {
	return Math.max(0.45, Math.min(2.5, nextScale));
}

function asRecord(value: unknown): WorkflowNodeConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return { ...(value as WorkflowNodeConfig) };
}

function asStringArray(value: unknown) {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function useWorkflowCanvasEditorState({
	isOpen,
	workflow,
	modelCatalog,
	toolCatalog,
	onCreateWorkflow,
	onUpdateWorkflow,
	onClose,
}: {
	isOpen: boolean;
	workflow: DashboardData["workflows"][number] | null;
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
	onCreateWorkflow: (draft: WorkflowDraft) => Promise<void>;
	onUpdateWorkflow: (workflowId: string, draft: WorkflowDraft) => Promise<void>;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [entryNode, setEntryNode] = useState("");
	const [nodes, setNodes] = useState<EditorNode[]>([]);
	const [edges, setEdges] = useState<WorkflowDraft["edges"]>([]);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [localError, setLocalError] = useState<string | null>(null);
	const canvasRef = useRef<HTMLDivElement | null>(null);

	const [viewport, setViewport] = useState<CanvasViewport>({
		scale: 1,
		offsetX: 40,
		offsetY: 40,
	});

	const [dragging, setDragging] = useState<{
		localId: string;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);

	const [panning, setPanning] = useState<{
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);

	const [edgeDraft, setEdgeDraft] = useState<EdgeDraft | null>(null);
	const [edgeHoverNodeKey, setEdgeHoverNodeKey] = useState<string | null>(null);

	const modelById = useMemo(
		() => new Map(modelCatalog.map((model) => [model.id, model])),
		[modelCatalog],
	);
	const toolById = useMemo(
		() => new Map(toolCatalog.map((tool) => [tool.id, tool])),
		[toolCatalog],
	);

	const hydrateNode = useCallback(
		(node: EditorNode): EditorNode => {
			const normalizedType = node.nodeType;
			const config = asRecord(node.config);
			let modelId = node.modelId ?? null;
			let toolIds = Array.from(new Set((node.toolIds ?? []).filter(Boolean)));

			if (normalizedType === "worker" || normalizedType === "supervisor") {
				if (!modelId && modelCatalog[0]) {
					modelId = modelCatalog[0].id;
				}
			}

			if (normalizedType === "worker") {
				if (typeof config.system_message !== "string") {
					config.system_message = "";
				}
				if (
					typeof config.max_iterations !== "number" ||
					!Number.isInteger(config.max_iterations) ||
					config.max_iterations < 1
				) {
					config.max_iterations = 3;
				}
			}

			if (normalizedType === "supervisor") {
				toolIds = [];
				config.members = Array.from(new Set(asStringArray(config.members)));
			}

			if (normalizedType === "tool") {
				modelId = null;
				const validToolIds = toolIds.filter((toolId) => toolById.has(toolId));
				const selectedToolId = validToolIds[0] ?? toolCatalog[0]?.id ?? null;
				toolIds = selectedToolId ? [selectedToolId] : [];
				config.input_mapping = asRecord(config.input_mapping);
				config.output_mapping = asRecord(config.output_mapping);
			}

			const tools = toolIds
				.map((toolId) => toolById.get(toolId))
				.filter((tool): tool is WorkflowToolOption => Boolean(tool));
			const model = modelId ? modelById.get(modelId) : null;

			return {
				...node,
				modelId,
				toolIds,
				tools,
				toolNames: tools.map((tool) => tool.name),
				modelLabel: model ? `${model.provider} / ${model.name}` : null,
				config,
			};
		},
		[modelById, modelCatalog, toolById, toolCatalog],
	);

	useEffect(() => {
		if (!isOpen) return;
		const initial = initialDraftFromWorkflow(workflow);
		const hydratedNodes = initial.nodes.map((node) => hydrateNode(node));
		setName(initial.name);
		setDescription(initial.description);
		setEntryNode(initial.entryNode);
		setNodes(hydratedNodes);
		setEdges(initial.edges);
		setSelectedNodeId(hydratedNodes[0]?.localId ?? null);
		setLocalError(null);
		setViewport({ scale: 1, offsetX: 40, offsetY: 40 });
		setEdgeDraft(null);
		setEdgeHoverNodeKey(null);
	}, [hydrateNode, isOpen, workflow]);

	const toWorldCoords = useCallback(
		(clientX: number, clientY: number) => {
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return { x: 0, y: 0 };
			return {
				x: (clientX - rect.left - viewport.offsetX) / viewport.scale,
				y: (clientY - rect.top - viewport.offsetY) / viewport.scale,
			};
		},
		[viewport.offsetX, viewport.offsetY, viewport.scale],
	);

	const applyZoom = useCallback(
		(factor: number, clientX?: number, clientY?: number) => {
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;

			const anchorClientX = clientX ?? rect.left + rect.width / 2;
			const anchorClientY = clientY ?? rect.top + rect.height / 2;

			setViewport((previous) => {
				const nextScale = clampScale(previous.scale * factor);
				if (nextScale === previous.scale) return previous;

				const worldX =
					(anchorClientX - rect.left - previous.offsetX) / previous.scale;
				const worldY =
					(anchorClientY - rect.top - previous.offsetY) / previous.scale;

				return {
					scale: nextScale,
					offsetX: anchorClientX - rect.left - worldX * nextScale,
					offsetY: anchorClientY - rect.top - worldY * nextScale,
				};
			});
		},
		[],
	);

	useEffect(() => {
		if (!dragging && !panning && !edgeDraft) return;

		const onPointerMove = (event: PointerEvent) => {
			if (dragging) {
				const nextX =
					dragging.originX + (event.clientX - dragging.startX) / viewport.scale;
				const nextY =
					dragging.originY + (event.clientY - dragging.startY) / viewport.scale;
				setNodes((previous) =>
					previous.map((node) =>
						node.localId === dragging.localId
							? {
									...node,
									x: Math.max(0, Math.round(nextX)),
									y: Math.max(0, Math.round(nextY)),
								}
							: node,
					),
				);
			}

			if (panning) {
				setViewport((previous) => ({
					...previous,
					offsetX: panning.originX + (event.clientX - panning.startX),
					offsetY: panning.originY + (event.clientY - panning.startY),
				}));
			}

			if (edgeDraft) {
				const world = toWorldCoords(event.clientX, event.clientY);
				setEdgeDraft((previous) =>
					previous
						? {
								...previous,
								toX: world.x,
								toY: world.y,
							}
						: previous,
				);
			}
		};

		const onPointerUp = () => {
			if (edgeDraft) {
				if (
					edgeHoverNodeKey &&
					edgeHoverNodeKey !== edgeDraft.fromNodeKey &&
					!edges.some(
						(edge) =>
							edge.fromNode === edgeDraft.fromNodeKey &&
							edge.toNode === edgeHoverNodeKey,
					)
				) {
					setEdges((previous) => [
						...previous,
						{
							fromNode: edgeDraft.fromNodeKey,
							toNode: edgeHoverNodeKey,
						},
					]);
				}
				setEdgeDraft(null);
				setEdgeHoverNodeKey(null);
			}

			setDragging(null);
			setPanning(null);
		};

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
		};
	}, [
		dragging,
		edgeDraft,
		edgeHoverNodeKey,
		edges,
		panning,
		toWorldCoords,
		viewport.scale,
	]);

	const selectedNode = useMemo(
		() => nodes.find((node) => node.localId === selectedNodeId) ?? null,
		[nodes, selectedNodeId],
	);

	const nodeValidationMessage = useMemo(
		() =>
			validateCanvasGraph({
				nodes,
				entryNode,
				edges,
				modelCatalog,
				toolCatalog,
			}),
		[edges, entryNode, modelCatalog, nodes, toolCatalog],
	);

	const addNode = (nodeType: string) => {
		const normalizedType = nodeType.trim().toLowerCase();
		const nodeKey = buildUniqueNodeKey(
			normalizedType,
			nodes.map((node) => node.nodeKey),
		);
		const nextNode: EditorNode = hydrateNode({
			localId: makeLocalId(),
			id: undefined,
			nodeKey,
			nodeType: normalizedType,
			x: Math.round((180 - viewport.offsetX) / viewport.scale),
			y: Math.round((140 - viewport.offsetY) / viewport.scale),
			inputKey: null,
			outputKey: null,
			modelId: null,
			toolIds: [],
			config: {},
			tools: [],
			toolNames: [],
			modelLabel: null,
		});
		setNodes((previous) => [...previous, nextNode]);
		setSelectedNodeId(nextNode.localId);
		if (!entryNode) {
			setEntryNode(nodeKey);
		}
	};

	const removeNode = (localId: string) => {
		const targetNode = nodes.find((node) => node.localId === localId);
		if (!targetNode) return;
		setNodes((previous) => previous.filter((node) => node.localId !== localId));
		setEdges((previous) =>
			previous.filter(
				(edge) =>
					edge.fromNode !== targetNode.nodeKey &&
					edge.toNode !== targetNode.nodeKey,
			),
		);
		if (entryNode === targetNode.nodeKey) {
			const fallback = nodes.find((node) => node.localId !== localId);
			setEntryNode(fallback?.nodeKey ?? "");
		}
		if (selectedNodeId === localId) {
			setSelectedNodeId(null);
		}
	};

	const updateSelectedNode = (changes: Partial<EditorNode>) => {
		if (!selectedNode) return;
		const previousNodeKey = selectedNode.nodeKey;
		const nextNodeType = changes.nodeType?.trim().toLowerCase();
		const removingWorkerRole =
			selectedNode.nodeType === "worker" &&
			nextNodeType != null &&
			nextNodeType !== "worker";
		setNodes((previous) =>
			previous.map((node) => {
				if (node.localId === selectedNode.localId) {
					return hydrateNode({
						...node,
						...changes,
						nodeType: nextNodeType ?? node.nodeType,
					});
				}
				if (node.nodeType === "supervisor") {
					const config = asRecord(node.config);
					const members = asStringArray(config.members);
					let nextMembers = members;

					if (changes.nodeKey && changes.nodeKey !== previousNodeKey) {
						nextMembers = nextMembers.map((member) =>
							member === previousNodeKey ? (changes.nodeKey ?? member) : member,
						);
					}

					if (removingWorkerRole) {
						const blockedMemberKeys = new Set([previousNodeKey]);
						if (changes.nodeKey) {
							blockedMemberKeys.add(changes.nodeKey);
						}
						nextMembers = nextMembers.filter(
							(member) => !blockedMemberKeys.has(member),
						);
					}

					const membersChanged =
						nextMembers.length !== members.length ||
						nextMembers.some((member, index) => member !== members[index]);
					if (!membersChanged) {
						return node;
					}

					return {
						...node,
						config: {
							...config,
							members: nextMembers,
						},
					};
				}
				return node;
			}),
		);
		if (changes.nodeKey && changes.nodeKey !== previousNodeKey) {
			setEdges((previous) =>
				previous.map((edge) => ({
					fromNode:
						edge.fromNode === previousNodeKey
							? (changes.nodeKey ?? "")
							: edge.fromNode,
					toNode:
						edge.toNode === previousNodeKey
							? (changes.nodeKey ?? "")
							: edge.toNode,
				})),
			);
			if (entryNode === previousNodeKey) {
				setEntryNode(changes.nodeKey);
			}
		}
	};

	const removeEdge = (edgeKey: string) => {
		setEdges((previous) =>
			previous.filter((edge) => `${edge.fromNode}->${edge.toNode}` !== edgeKey),
		);
	};

	const addEdgeToEnd = (fromNode: string) => {
		if (!fromNode) return;
		setEdges((previous) => {
			if (
				previous.some(
					(edge) => edge.fromNode === fromNode && edge.toNode === "END",
				)
			) {
				return previous;
			}
			return [...previous, { fromNode, toNode: "END" }];
		});
	};

	const startNodeDrag = (
		event: ReactPointerEvent<HTMLDivElement>,
		node: EditorNode,
	) => {
		if (event.button !== 0) return;
		setSelectedNodeId(node.localId);
		setDragging({
			localId: node.localId,
			startX: event.clientX,
			startY: event.clientY,
			originX: node.x,
			originY: node.y,
		});
	};

	const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		if (event.target !== event.currentTarget) return;
		setPanning({
			startX: event.clientX,
			startY: event.clientY,
			originX: viewport.offsetX,
			originY: viewport.offsetY,
		});
	};

	const startEdgeDrag = (
		fromNodeKey: string,
		event: ReactPointerEvent<HTMLButtonElement>,
	) => {
		event.stopPropagation();
		event.preventDefault();
		const world = toWorldCoords(event.clientX, event.clientY);
		setEdgeDraft({
			fromNodeKey,
			toX: world.x,
			toY: world.y,
		});
		setEdgeHoverNodeKey(null);
	};

	const setEdgeHoverTarget = (nodeKey: string | null) => {
		if (!edgeDraft) return;
		setEdgeHoverNodeKey(nodeKey);
	};

	const onCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		const factor = event.deltaY < 0 ? 1.08 : 0.92;
		applyZoom(factor, event.clientX, event.clientY);
	};

	const zoomIn = () => applyZoom(1.12);
	const zoomOut = () => applyZoom(0.88);
	const resetView = () => setViewport({ scale: 1, offsetX: 40, offsetY: 40 });

	const saveGraph = async () => {
		setLocalError(null);
		if (name.trim().length < 2) {
			setLocalError("Workflow name must be at least 2 characters.");
			return;
		}
		if (nodeValidationMessage) {
			setLocalError(nodeValidationMessage);
			return;
		}

		const payload: WorkflowDraft = {
			name: name.trim(),
			description: description.trim(),
			entryNode: entryNode.trim(),
			nodes: nodes.map((node) => ({
				id: node.id,
				nodeKey: node.nodeKey.trim(),
				nodeType: node.nodeType,
				x: Math.round(node.x),
				y: Math.round(node.y),
				inputKey: node.inputKey?.trim() ? node.inputKey.trim() : null,
				outputKey: node.outputKey?.trim() ? node.outputKey.trim() : null,
				modelId: node.modelId,
				toolIds: node.toolIds,
				config: asRecord(node.config),
			})),
			edges: edges.map((edge) => ({
				fromNode: edge.fromNode,
				toNode: edge.toNode,
			})),
		};

		try {
			if (workflow) {
				await onUpdateWorkflow(workflow.id, payload);
			} else {
				await onCreateWorkflow(payload);
			}
			onClose();
		} catch {
			// Parent state presents server error.
		}
	};

	return {
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
	};
}
