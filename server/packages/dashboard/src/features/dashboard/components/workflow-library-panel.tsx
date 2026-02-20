import { PlusCircle, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { DashboardData } from "@/features/dashboard/types";
import { NodeCharacter } from "./node-character";

export function WorkflowLibraryPanel({
	workflows,
	onOpenCreate,
	onOpenEdit,
}: {
	workflows: DashboardData["workflows"];
	onOpenCreate: () => void;
	onOpenEdit: (workflow: DashboardData["workflows"][number]) => void;
}) {
	return (
		<div className="grid gap-4 md:grid-cols-2">
			<Card className="relative overflow-hidden border-slate-900/20 bg-[linear-gradient(120deg,rgba(250,204,21,0.18),rgba(14,165,233,0.12),rgba(34,197,94,0.14))] shadow-[0_18px_40px_rgba(14,165,233,0.15)] md:col-span-2">
				<div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_25%_20%,rgba(2,6,23,0.3),transparent_28%),radial-gradient(circle_at_80%_70%,rgba(2,6,23,0.25),transparent_35%)]" />
				<CardHeader className="relative space-y-2">
					<Badge className="w-fit rounded-full border-slate-900/10 bg-white/80 text-slate-800 hover:bg-white">
						Visual Workflow Builder
					</Badge>
					<CardTitle className="font-display text-2xl text-slate-900">
						Design workflows on a full-screen canvas
					</CardTitle>
					<CardDescription className="max-w-2xl text-slate-700">
						Create and edit workflows in a drag-and-drop graph editor with node
						inspector controls and edge management.
					</CardDescription>
				</CardHeader>
				<CardContent className="relative">
					<Button
						type="button"
						onClick={onOpenCreate}
						className="rounded-full border border-slate-900/20 bg-slate-900 px-6 text-white hover:bg-slate-800"
					>
						<PlusCircle className="mr-1.5 size-4" />
						New Workflow Canvas
					</Button>
				</CardContent>
			</Card>

			{workflows.length === 0 ? (
				<Card className="md:col-span-2">
					<CardContent className="flex flex-col items-center gap-3 py-12 text-center">
						<div className="rounded-2xl bg-slate-100 p-4">
							<Workflow className="size-8 text-slate-300" />
						</div>
						<div>
							<p className="font-medium text-slate-500">No workflows yet</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Open the canvas to create your first flow.
							</p>
						</div>
					</CardContent>
				</Card>
			) : (
				workflows.map((workflow) => (
					<Card
						key={workflow.id}
						className="border-slate-900/10 bg-white/90 shadow-[0_12px_36px_rgba(2,132,199,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_44px_rgba(2,132,199,0.16)]"
					>
						<CardHeader className="space-y-2">
							<div className="flex items-start justify-between gap-3">
								<div>
									<CardTitle className="font-display text-xl">
										{workflow.name}
									</CardTitle>
									<CardDescription>
										{workflow.description ?? "No description yet."}
									</CardDescription>
								</div>
								<div className="flex items-center gap-2">
									<Badge className="rounded-full border-transparent bg-slate-900 text-slate-100 hover:bg-slate-900">
										{workflow.attachedDeviceCount} devices
									</Badge>
									<Button
										type="button"
										variant="outline"
										className="h-8 rounded-full px-3 text-xs"
										onClick={() => onOpenEdit(workflow)}
									>
										Open Canvas
									</Button>
								</div>
							</div>
							<div className="flex flex-wrap gap-2 text-xs">
								<Badge variant="outline">Entry: {workflow.entryNode}</Badge>
								<Badge variant="outline">{workflow.edgeCount} edges</Badge>
								<Badge variant="outline">
									{workflow.nodeTypeCounts.worker} workers
								</Badge>
								<Badge variant="outline">
									{workflow.nodeTypeCounts.supervisor} supervisors
								</Badge>
								<Badge variant="outline">
									{workflow.nodeTypeCounts.tool} tools
								</Badge>
							</div>
						</CardHeader>
						<CardContent>
							<div className="grid gap-2">
								{workflow.nodeSamples.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No nodes in this workflow yet.
									</p>
								) : (
									workflow.nodeSamples.map((node) => (
										<NodeCharacter
											key={node.id}
											nodeType={node.nodeType}
											nodeKey={node.nodeKey}
											toolNames={node.toolNames}
										/>
									))
								)}
							</div>
						</CardContent>
					</Card>
				))
			)}
		</div>
	);
}
