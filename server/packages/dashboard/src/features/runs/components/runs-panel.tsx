import { useServerFn } from "@tanstack/react-start";
import { Activity, ChevronDown, Clock, Zap } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { RunStepsDetail } from "@/features/runs/components/run-steps-detail";
import { getAgentGraphRuns } from "@/features/runs/server/runs-data";
import type { RunItem, RunsResponse } from "@/features/runs/types";
import { cn } from "@/lib/utils";

function statusBadgeVariant(status: string) {
	switch (status) {
		case "completed":
			return "bg-emerald-100 text-emerald-700 border-emerald-200";
		case "running":
			return "bg-amber-100 text-amber-700 border-amber-200";
		case "failed":
			return "bg-rose-100 text-rose-700 border-rose-200";
		default:
			return "bg-slate-100 text-slate-600 border-slate-200";
	}
}

function formatDuration(start: string, end: string | null): string {
	if (!end) return "running";
	const ms = new Date(end).getTime() - new Date(start).getTime();
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatTimestamp(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function statusIcon(status: string) {
	switch (status) {
		case "completed":
			return <Zap className="size-4 text-emerald-600" />;
		case "running":
			return <Activity className="size-4 animate-pulse text-amber-600" />;
		case "failed":
			return <Zap className="size-4 text-rose-500" />;
		default:
			return <Clock className="size-4 text-slate-400" />;
	}
}

function RunRow({
	run,
	isExpanded,
	onToggle,
}: {
	run: RunItem;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	return (
		<Card
			className={cn(
				"overflow-hidden border-slate-200/60 bg-white/80 shadow-sm transition-all hover:shadow-md",
				isExpanded && "ring-1 ring-slate-200",
			)}
		>
			<button
				type="button"
				className="w-full cursor-pointer text-left"
				onClick={onToggle}
			>
				<CardHeader className="px-4 pb-2 sm:px-6">
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"flex size-8 shrink-0 items-center justify-center rounded-lg",
								run.status === "completed" && "bg-emerald-50",
								run.status === "running" && "bg-amber-50",
								run.status === "failed" && "bg-rose-50",
								!["completed", "running", "failed"].includes(run.status) &&
									"bg-slate-100",
							)}
						>
							{statusIcon(run.status)}
						</div>
						<div className="min-w-0 flex-1">
							<CardTitle className="truncate text-sm font-medium">
								{run.workflowName}
							</CardTitle>
							<CardDescription className="text-xs">
								{formatTimestamp(run.startedAt)}
								<span className="ml-2 tabular-nums text-slate-400">
									{formatDuration(run.startedAt, run.finishedAt)}
								</span>
							</CardDescription>
						</div>
						<Badge
							variant="outline"
							className={cn(
								"hidden shrink-0 rounded-full text-[11px] sm:inline-flex",
								statusBadgeVariant(run.status),
							)}
						>
							{run.status}
						</Badge>
						<ChevronDown
							className={cn(
								"size-4 shrink-0 text-slate-400 transition-transform",
								isExpanded && "rotate-180",
							)}
						/>
					</div>
					{run.error ? (
						<p className="mt-1 truncate pl-10 text-xs text-rose-500">
							{run.error.length > 100
								? `${run.error.slice(0, 100)}...`
								: run.error}
						</p>
					) : null}
				</CardHeader>
			</button>
			{isExpanded ? (
				<CardContent className="px-4 pt-0 sm:px-6">
					<RunStepsDetail runId={run.id} />
				</CardContent>
			) : null}
		</Card>
	);
}

export function RunsPanel({
	initialData,
	organizationId,
}: {
	initialData: RunsResponse;
	organizationId: string;
}) {
	const fetchRuns = useServerFn(getAgentGraphRuns);
	const [runs, setRuns] = useState<RunItem[]>(initialData.runs);
	const [nextCursor, setNextCursor] = useState<string | null>(
		initialData.nextCursor,
	);
	const [loadingMore, setLoadingMore] = useState(false);
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

	const loadMore = async () => {
		if (!nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const result = await fetchRuns({
				data: { organizationId, cursor: nextCursor },
			});
			setRuns((prev) => [...prev, ...result.runs]);
			setNextCursor(result.nextCursor);
		} catch {
			// silently fail, user can retry
		} finally {
			setLoadingMore(false);
		}
	};

	if (runs.length === 0) {
		return (
			<Card className="border-slate-200/60 bg-white/80 py-16 text-center shadow-sm">
				<CardHeader>
					<div className="flex flex-col items-center gap-3">
						<div className="rounded-2xl bg-slate-100 p-4">
							<Activity className="size-8 text-slate-300" />
						</div>
						<div>
							<CardTitle className="text-slate-500">No runs yet</CardTitle>
							<CardDescription className="mt-1">
								Agent graph runs will appear here once workflows are executed.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="space-y-3">
			{runs.map((run) => (
				<RunRow
					key={run.id}
					run={run}
					isExpanded={expandedRunId === run.id}
					onToggle={() =>
						setExpandedRunId((prev) => (prev === run.id ? null : run.id))
					}
				/>
			))}
			{nextCursor ? (
				<div className="flex justify-center pt-2">
					<Button
						type="button"
						variant="outline"
						onClick={loadMore}
						disabled={loadingMore}
						className="rounded-full border-slate-300 text-slate-600"
					>
						{loadingMore ? "Loading..." : "Load more"}
					</Button>
				</div>
			) : null}
		</div>
	);
}
