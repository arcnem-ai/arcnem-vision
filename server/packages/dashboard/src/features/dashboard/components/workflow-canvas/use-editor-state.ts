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
	WorkflowTemplateDraft,
	WorkflowTemplateVisibility,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import { type EditorNode, initialDraftFromGraph, makeLocalId } from "./shared";
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

function getConditionTargets(node: EditorNode) {
	if (node.nodeType !== "condition") return [] as string[];
	const config = asRecord(node.config);
	return [config.true_target, config.false_target]
		.filter((target): target is string => typeof target === "string")
		.map((target) => target.trim())
		.filter((target) => target.length > 0);
}

function dedupeEdges(edges: WorkflowDraft["edges"]) {
	const seen = new Set<string>();
	return edges.filter((edge) => {
		const key = `${edge.fromNode}->${edge.toNode}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function syncConditionEdges(
	nodes: EditorNode[],
	edges: WorkflowDraft["edges"],
): WorkflowDraft["edges"] {
	const conditionNodeKeys = new Set(
		nodes
			.filter((node) => node.nodeType === "condition")
			.map((node) => node.nodeKey),
	);
	const manualEdges = edges.filter(
		(edge) => !conditionNodeKeys.has(edge.fromNode),
	);
	const managedEdges = nodes.flatMap((node) =>
		getConditionTargets(node).map((target) => ({
			fromNode: node.nodeKey,
			toNode: target,
		})),
	);
	return dedupeEdges([...manualEdges, ...managedEdges]);
}

export function useWorkflowCanvasEditorState({
	isOpen,
	mode,
	graph,
	modelCatalog,
	toolCatalog,
	onCreateWorkflow,
	onUpdateWorkflow,
	onUpdateTemplate,
	onClose,
}: {
	isOpen: boolean;
	mode: "workflow-create" | "workflow-edit" | "template-edit";
	graph:
		| DashboardData["workflows"][number]
		| DashboardData["workflowTemplates"][number]
		| null;
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
	onCreateWorkflow: (draft: WorkflowDraft) => Promise<void>;
	onUpdateWorkflow: (workflowId: string, draft: WorkflowDraft) => Promise<void>;
	onUpdateTemplate: (
		templateId: string,
		draft: WorkflowTemplateDraft,
	) => Promise<void>;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [entryNode, setEntryNode] = useState("");
	const [templateVisibility, setTemplateVisibility] =
		useState<WorkflowTemplateVisibility>("organization");
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

			if (normalizedType === "condition") {
				modelId = null;
				toolIds = [];
				config.source_key =
					typeof config.source_key === "string" ? config.source_key : "";
				config.operator =
					typeof config.operator === "string"
						? config.operator.trim().toLowerCase() || "contains"
						: "contains";
				config.value = typeof config.value === "string" ? config.value : "";
				config.case_sensitive = Boolean(config.case_sensitive);
				config.true_target =
					typeof config.true_target === "string" ? config.true_target : "";
				config.false_target =
					typeof config.false_target === "string" ? config.false_target : "";
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
		const initial = initialDraftFromGraph(graph);
		const hydratedNodes = initial.nodes.map((node) => hydrateNode(node));
		setName(initial.name);
		setDescription(initial.description);
		setEntryNode(initial.entryNode);
		setTemplateVisibility(
			mode === "template-edit" && graph && "visibility" in graph
				? graph.visibility
				: "organization",
		);
		setNodes(hydratedNodes);
		setEdges(syncConditionEdges(hydratedNodes, initial.edges));
		setSelectedNodeId(hydratedNodes[0]?.localId ?? null);
		setLocalError(null);
		setViewport({ scale: 1, offsetX: 40, offsetY: 40 });
		setEdgeDraft(null);
		setEdgeHoverNodeKey(null);
	}, [graph, hydrateNode, isOpen, mode]);

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
			config:
				normalizedType === "condition"
					? {
							source_key: "",
							operator: "contains",
							value: "",
							case_sensitive: false,
							true_target: "",
							false_target: "",
						}
					: {},
			tools: [],
			toolNames: [],
			modelLabel: null,
		});
		const nextNodes = [...nodes, nextNode];
		setNodes(nextNodes);
		setEdges((previous) => syncConditionEdges(nextNodes, previous));
		setSelectedNodeId(nextNode.localId);
		if (!entryNode) {
			setEntryNode(nodeKey);
		}
	};

	const removeNode = (localId: string) => {
		const targetNode = nodes.find((node) => node.localId === localId);
		if (!targetNode) return;
		const nextNodes = nodes
			.filter((node) => node.localId !== localId)
			.map((node) => {
				if (node.nodeType === "supervisor") {
					const config = asRecord(node.config);
					const members = asStringArray(config.members).filter(
						(member) => member !== targetNode.nodeKey,
					);
					return {
						...node,
						config: {
							...config,
							members,
						},
					};
				}
				if (node.nodeType === "condition") {
					const config = asRecord(node.config);
					const nextConfig = { ...config };
					if (config.true_target === targetNode.nodeKey) {
						nextConfig.true_target = "";
					}
					if (config.false_target === targetNode.nodeKey) {
						nextConfig.false_target = "";
					}
					return {
						...node,
						config: nextConfig,
					};
				}
				return node;
			});
		const survivingEdges = edges.filter(
			(edge) =>
				edge.fromNode !== targetNode.nodeKey &&
				edge.toNode !== targetNode.nodeKey,
		);
		setNodes(nextNodes);
		setEdges(syncConditionEdges(nextNodes, survivingEdges));
		if (entryNode === targetNode.nodeKey) {
			const fallback = nextNodes[0];
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
		const nextNodes = nodes.map((node) => {
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
			if (node.nodeType === "condition") {
				const config = asRecord(node.config);
				const nextConfig = { ...config };
				let changed = false;
				if (changes.nodeKey && config.true_target === previousNodeKey) {
					nextConfig.true_target = changes.nodeKey;
					changed = true;
				}
				if (changes.nodeKey && config.false_target === previousNodeKey) {
					nextConfig.false_target = changes.nodeKey;
					changed = true;
				}
				if (!changed) {
					return node;
				}
				return {
					...node,
					config: nextConfig,
				};
			}
			return node;
		});
		if (changes.nodeKey && changes.nodeKey !== previousNodeKey) {
			const renamedEdges = edges.map((edge) => ({
				fromNode:
					edge.fromNode === previousNodeKey
						? (changes.nodeKey ?? "")
						: edge.fromNode,
				toNode:
					edge.toNode === previousNodeKey
						? (changes.nodeKey ?? "")
						: edge.toNode,
			}));
			setEdges(syncConditionEdges(nextNodes, renamedEdges));
			if (entryNode === previousNodeKey) {
				setEntryNode(changes.nodeKey);
			}
		} else {
			setEdges((previous) => syncConditionEdges(nextNodes, previous));
		}
		setNodes(nextNodes);
	};

	const removeEdge = (edgeKey: string) => {
		const [fromNode, toNode] = edgeKey.split("->");
		const sourceNode = nodes.find((node) => node.nodeKey === fromNode);
		if (sourceNode?.nodeType === "condition") {
			const nextNodes = nodes.map((node) => {
				if (node.nodeKey !== fromNode) {
					return node;
				}
				const config = asRecord(node.config);
				const nextConfig = { ...config };
				if (config.true_target === toNode) {
					nextConfig.true_target = "";
				}
				if (config.false_target === toNode) {
					nextConfig.false_target = "";
				}
				return {
					...node,
					config: nextConfig,
				};
			});
			const remainingEdges = edges.filter(
				(edge) => `${edge.fromNode}->${edge.toNode}` !== edgeKey,
			);
			setNodes(nextNodes);
			setEdges(syncConditionEdges(nextNodes, remainingEdges));
			return;
		}

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
		const sourceNode = nodes.find((node) => node.nodeKey === fromNodeKey);
		if (sourceNode?.nodeType === "condition") {
			return;
		}
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
			if (mode === "template-edit" && graph) {
				await onUpdateTemplate(graph.id, {
					...payload,
					visibility: templateVisibility,
				});
			} else if (mode === "workflow-edit" && graph) {
				await onUpdateWorkflow(graph.id, payload);
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
		templateVisibility,
		setName,
		setDescription,
		setEntryNode,
		setTemplateVisibility,
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
