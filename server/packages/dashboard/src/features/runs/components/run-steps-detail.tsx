import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentGraphRunSteps } from "@/features/runs/server/runs-data";
import type { RunStepsResponse } from "@/features/runs/types";

function formatDuration(start: string, end: string | null): string {
	if (!end) return "in progress";
	const ms = new Date(end).getTime() - new Date(start).getTime();
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function JsonBlock({ data }: { data: unknown }) {
	if (data === null || data === undefined) {
		return <span className="text-xs italic text-slate-400">null</span>;
	}
	return (
		<div className="max-h-48 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2">
			<pre className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
				{JSON.stringify(data, null, 2)}
			</pre>
		</div>
	);
}

export function RunStepsDetail({ runId }: { runId: string }) {
	const fetchSteps = useServerFn(getAgentGraphRunSteps);
	const [data, setData] = useState<RunStepsResponse | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		fetchSteps({ data: { runId } })
			.then((result: RunStepsResponse) => {
				if (!cancelled) setData(result);
			})
			.catch(() => {
				if (!cancelled) setData(null);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [runId, fetchSteps]);

	if (loading) {
		return (
			<div className="space-y-2 px-4 pb-4">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>
		);
	}

	if (!data || data.steps.length === 0) {
		return (
			<p className="px-4 pb-4 text-sm text-slate-400">
				No steps recorded for this run.
			</p>
		);
	}

	return (
		<div className="min-w-0 space-y-3 overflow-hidden px-4 pb-4">
			{data.initialState !== null && data.initialState !== undefined ? (
				<div>
					<p className="mb-1 text-xs font-medium text-slate-500">
						Initial State
					</p>
					<JsonBlock data={data.initialState} />
				</div>
			) : null}

			<Separator />

			<div className="space-y-2">
				{data.steps.map((step) => (
					<div
						key={step.id}
						className="min-w-0 overflow-hidden rounded-lg border border-slate-200/70 bg-white/60 p-3"
					>
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className="rounded-full text-[11px] tabular-nums"
							>
								#{step.stepOrder}
							</Badge>
							<span className="text-sm font-medium text-slate-700">
								{step.nodeKey}
							</span>
							<span className="ml-auto text-xs text-slate-400">
								{formatDuration(step.startedAt, step.finishedAt)}
							</span>
						</div>
						{step.stateDelta !== null && step.stateDelta !== undefined ? (
							<div className="mt-2">
								<p className="mb-1 text-[11px] text-slate-400">State Delta</p>
								<JsonBlock data={step.stateDelta} />
							</div>
						) : null}
					</div>
				))}
			</div>

			{data.finalState !== null && data.finalState !== undefined ? (
				<>
					<Separator />
					<div>
						<p className="mb-1 text-xs font-medium text-slate-500">
							Final State
						</p>
						<JsonBlock data={data.finalState} />
					</div>
				</>
			) : null}

			{data.error ? (
				<>
					<Separator />
					<div>
						<p className="mb-1 text-xs font-medium text-rose-500">Error</p>
						<p className="text-sm text-rose-600">{data.error}</p>
					</div>
				</>
			) : null}
		</div>
	);
}
