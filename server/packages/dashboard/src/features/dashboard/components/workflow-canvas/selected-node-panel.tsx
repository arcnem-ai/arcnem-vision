import { useEffect, useMemo, useState } from "react";
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
	WorkflowModelOption,
	WorkflowNodeConfig,
	WorkflowToolOption,
} from "@/features/dashboard/types";
import type { EditorNode } from "./shared";

function isRecord(value: unknown): value is WorkflowNodeConfig {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown) {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

export function SelectedNodePanel({
	selectedNode,
	nodes,
	modelCatalog,
	toolCatalog,
	onChangeSelectedNode,
	onAddEdgeToEnd,
}: {
	selectedNode: EditorNode;
	nodes: EditorNode[];
	modelCatalog: WorkflowModelOption[];
	toolCatalog: WorkflowToolOption[];
	onChangeSelectedNode: (changes: Partial<EditorNode>) => void;
	onAddEdgeToEnd: (fromNode: string) => void;
}) {
	const [rawConfigText, setRawConfigText] = useState("");
	const [rawConfigError, setRawConfigError] = useState<string | null>(null);

	useEffect(() => {
		setRawConfigText(JSON.stringify(selectedNode.config ?? {}, null, 2));
		setRawConfigError(null);
	}, [selectedNode.config]);

	const config = useMemo(
		() => (isRecord(selectedNode.config) ? selectedNode.config : {}),
		[selectedNode.config],
	);
	const selectedToolId = selectedNode.toolIds[0] ?? "";
	const selectedTool =
		toolCatalog.find((tool) => tool.id === selectedToolId) ?? null;
	const inputMapping = isRecord(config.input_mapping)
		? config.input_mapping
		: ({} as WorkflowNodeConfig);
	const outputMapping = isRecord(config.output_mapping)
		? config.output_mapping
		: ({} as WorkflowNodeConfig);
	const workerMembers = nodes
		.filter(
			(node) =>
				node.nodeType === "worker" && node.localId !== selectedNode.localId,
		)
		.map((node) => node.nodeKey);
	const supervisorMembers = asStringArray(config.members);

	const updateConfig = (patch: WorkflowNodeConfig) => {
		onChangeSelectedNode({
			config: {
				...config,
				...patch,
			},
		});
	};

	const toggleSupervisorMember = (memberNodeKey: string) => {
		const members = new Set(supervisorMembers);
		if (members.has(memberNodeKey)) {
			members.delete(memberNodeKey);
		} else {
			members.add(memberNodeKey);
		}
		updateConfig({ members: Array.from(members) });
	};

	const toggleWorkerTool = (toolId: string) => {
		const selectedToolIds = new Set(selectedNode.toolIds);
		if (selectedToolIds.has(toolId)) {
			selectedToolIds.delete(toolId);
		} else {
			selectedToolIds.add(toolId);
		}
		onChangeSelectedNode({ toolIds: Array.from(selectedToolIds) });
	};

	const setToolMapping = (
		type: "input_mapping" | "output_mapping",
		field: string,
		value: string,
	) => {
		const currentMapping = isRecord(config[type])
			? { ...(config[type] as WorkflowNodeConfig) }
			: {};
		if (value.trim().length === 0) {
			delete currentMapping[field];
		} else {
			currentMapping[field] = value;
		}
		updateConfig({ [type]: currentMapping });
	};

	const saveRawConfig = (value: string) => {
		setRawConfigText(value);
		try {
			const parsed = JSON.parse(value);
			if (!isRecord(parsed)) {
				setRawConfigError("Config JSON must be an object.");
				return;
			}
			onChangeSelectedNode({ config: parsed });
			setRawConfigError(null);
		} catch {
			setRawConfigError("Config JSON is invalid.");
		}
	};

	const renderToolMappingRows = (
		mappingType: "input_mapping" | "output_mapping",
		fields: string[],
		fallbackHint: string,
	) => {
		if (fields.length === 0) {
			return (
				<p className="text-xs text-slate-500">
					No schema fields found. Use raw config JSON if needed.
				</p>
			);
		}

		return fields.map((field) => {
			const currentValue =
				typeof (mappingType === "input_mapping"
					? inputMapping[field]
					: outputMapping[field]) === "string"
					? String(
							mappingType === "input_mapping"
								? inputMapping[field]
								: outputMapping[field],
						)
					: "";

			return (
				<div key={`${mappingType}-${field}`} className="space-y-1">
					<p className="text-xs font-medium text-slate-700">{field}</p>
					<Input
						value={currentValue}
						onChange={(event) =>
							setToolMapping(mappingType, field, event.target.value)
						}
						placeholder={fallbackHint}
					/>
				</div>
			);
		});
	};

	return (
		<div className="space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Selected node
			</p>
			<div>
				<label
					htmlFor="canvas-node-key"
					className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
				>
					Node key
				</label>
				<Input
					id="canvas-node-key"
					value={selectedNode.nodeKey}
					onChange={(event) =>
						onChangeSelectedNode({ nodeKey: event.target.value })
					}
				/>
			</div>
			<div>
				<p className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
					Node type
				</p>
				<Select
					value={selectedNode.nodeType}
					onValueChange={(value) => onChangeSelectedNode({ nodeType: value })}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="worker">worker</SelectItem>
						<SelectItem value="supervisor">supervisor</SelectItem>
						<SelectItem value="tool">tool</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="grid grid-cols-2 gap-2">
				<div>
					<label
						htmlFor="canvas-node-input-key"
						className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
					>
						Input key
					</label>
					<Input
						id="canvas-node-input-key"
						value={selectedNode.inputKey ?? ""}
						onChange={(event) =>
							onChangeSelectedNode({
								inputKey:
									event.target.value.length > 0 ? event.target.value : null,
							})
						}
						placeholder="temp_url"
					/>
				</div>
				<div>
					<label
						htmlFor="canvas-node-output-key"
						className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
					>
						Output key
					</label>
					<Input
						id="canvas-node-output-key"
						value={selectedNode.outputKey ?? ""}
						onChange={(event) =>
							onChangeSelectedNode({
								outputKey:
									event.target.value.length > 0 ? event.target.value : null,
							})
						}
						placeholder="result"
					/>
				</div>
			</div>

			{selectedNode.nodeType === "worker" ||
			selectedNode.nodeType === "supervisor" ? (
				<div>
					<p className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
						Model
					</p>
					<Select
						value={selectedNode.modelId ?? "__none"}
						onValueChange={(value) =>
							onChangeSelectedNode({
								modelId: value === "__none" ? null : value,
							})
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select model" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__none">No model</SelectItem>
							{modelCatalog.map((model) => (
								<SelectItem key={model.id} value={model.id}>
									{model.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : null}

			{selectedNode.nodeType === "worker" ? (
				<div className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
						Worker config
					</p>
					<div>
						<label
							htmlFor="canvas-node-system-message"
							className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
						>
							System message
						</label>
						<textarea
							id="canvas-node-system-message"
							rows={4}
							value={
								typeof config.system_message === "string"
									? config.system_message
									: ""
							}
							onChange={(event) =>
								updateConfig({ system_message: event.target.value })
							}
							className="w-full rounded-md border border-slate-900/15 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900/40 focus:ring-2 focus:ring-sky-200"
						/>
					</div>
					<div>
						<label
							htmlFor="canvas-node-max-iterations"
							className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
						>
							Max iterations
						</label>
						<Input
							id="canvas-node-max-iterations"
							type="number"
							value={
								typeof config.max_iterations === "number"
									? Math.max(1, Math.round(config.max_iterations))
									: 3
							}
							onChange={(event) =>
								updateConfig({
									max_iterations: Math.max(
										1,
										Math.round(Number(event.target.value) || 1),
									),
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
							Assigned tools
						</p>
						{toolCatalog.length === 0 ? (
							<p className="text-xs text-slate-500">No tools available yet.</p>
						) : (
							<div className="space-y-1">
								{toolCatalog.map((tool) => {
									const selected = selectedNode.toolIds.includes(tool.id);
									return (
										<button
											key={tool.id}
											type="button"
											onClick={() => toggleWorkerTool(tool.id)}
											className={`w-full rounded-md border px-2 py-1 text-left text-sm transition ${
												selected
													? "border-amber-300 bg-amber-50 text-amber-900"
													: "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
											}`}
										>
											<p className="font-medium">{tool.name}</p>
											<p className="line-clamp-2 text-[11px] text-slate-500">
												{tool.description}
											</p>
										</button>
									);
								})}
							</div>
						)}
						<p className="text-[11px] text-slate-500">
							Workers can use one or more tools during agent execution.
						</p>
					</div>
				</div>
			) : null}

			{selectedNode.nodeType === "supervisor" ? (
				<div className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
						Supervisor members
					</p>
					{workerMembers.length === 0 ? (
						<p className="text-xs text-slate-500">
							Add worker nodes, then select them as members.
						</p>
					) : (
						workerMembers.map((memberNodeKey) => {
							const isSelected = supervisorMembers.includes(memberNodeKey);
							return (
								<button
									key={memberNodeKey}
									type="button"
									onClick={() => toggleSupervisorMember(memberNodeKey)}
									className={`w-full rounded-md border px-2 py-1 text-left text-sm transition ${
										isSelected
											? "border-sky-300 bg-sky-50 text-sky-900"
											: "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
									}`}
								>
									{memberNodeKey}
								</button>
							);
						})
					)}
					<Button
						type="button"
						variant="outline"
						onClick={() => onAddEdgeToEnd(selectedNode.nodeKey)}
					>
						Add edge to END
					</Button>
				</div>
			) : null}

			{selectedNode.nodeType === "tool" ? (
				<div className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
						Tool config
					</p>
					<div>
						<p className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
							Tool
						</p>
						<Select
							value={selectedToolId || "__none"}
							onValueChange={(value) =>
								onChangeSelectedNode({
									toolIds: value === "__none" ? [] : [value],
								})
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select tool" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__none">No tool</SelectItem>
								{toolCatalog.map((tool) => (
									<SelectItem key={tool.id} value={tool.id}>
										{tool.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedTool ? (
						<>
							<p className="text-xs text-slate-600">
								{selectedTool.description}
							</p>

							<div className="space-y-2">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
									Input Mapping
								</p>
								{renderToolMappingRows(
									"input_mapping",
									selectedTool.inputFields,
									"state_key or _const:value",
								)}
							</div>

							<div className="space-y-2">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
									Output Mapping
								</p>
								{renderToolMappingRows(
									"output_mapping",
									selectedTool.outputFields,
									"state_key",
								)}
							</div>

							<div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
									Tool IO Schemas
								</p>
								<div>
									<p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
										Input schema
									</p>
									<pre className="max-h-32 overflow-auto rounded bg-white p-2 text-[11px] text-slate-700">
										{JSON.stringify(selectedTool.inputSchema ?? {}, null, 2)}
									</pre>
								</div>
								<div>
									<p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
										Output schema
									</p>
									<pre className="max-h-32 overflow-auto rounded bg-white p-2 text-[11px] text-slate-700">
										{JSON.stringify(selectedTool.outputSchema ?? {}, null, 2)}
									</pre>
								</div>
							</div>
						</>
					) : (
						<p className="text-xs text-slate-500">
							Select a tool to view its input/output contract.
						</p>
					)}
					<Button
						type="button"
						variant="outline"
						onClick={() => onAddEdgeToEnd(selectedNode.nodeKey)}
					>
						Add edge to END
					</Button>
				</div>
			) : null}

			{selectedNode.nodeType === "worker" ? (
				<Button
					type="button"
					variant="outline"
					onClick={() => onAddEdgeToEnd(selectedNode.nodeKey)}
				>
					Add edge to END
				</Button>
			) : null}

			<div>
				<label
					htmlFor="canvas-node-config-json"
					className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
				>
					Advanced config JSON
				</label>
				<textarea
					id="canvas-node-config-json"
					rows={6}
					value={rawConfigText}
					onChange={(event) => saveRawConfig(event.target.value)}
					className="w-full rounded-md border border-slate-900/15 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition focus:border-slate-900/40 focus:ring-2 focus:ring-sky-200"
				/>
				{rawConfigError ? (
					<p className="mt-1 text-xs text-rose-600">{rawConfigError}</p>
				) : (
					<p className="mt-1 text-xs text-slate-500">
						Use this for advanced fields not covered above.
					</p>
				)}
			</div>

			<div className="grid grid-cols-2 gap-2">
				<div>
					<label
						htmlFor="canvas-node-x"
						className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
					>
						X
					</label>
					<Input
						id="canvas-node-x"
						type="number"
						value={Math.round(selectedNode.x)}
						onChange={(event) =>
							onChangeSelectedNode({ x: Number(event.target.value) || 0 })
						}
					/>
				</div>
				<div>
					<label
						htmlFor="canvas-node-y"
						className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600"
					>
						Y
					</label>
					<Input
						id="canvas-node-y"
						type="number"
						value={Math.round(selectedNode.y)}
						onChange={(event) =>
							onChangeSelectedNode({ y: Number(event.target.value) || 0 })
						}
					/>
				</div>
			</div>
		</div>
	);
}
