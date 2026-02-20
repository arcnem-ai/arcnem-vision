import type { ComponentType } from "react";

export function StatChip({
	label,
	value,
	icon: Icon,
}: {
	label: string;
	value: string;
	icon: ComponentType<{ className?: string }>;
}) {
	return (
		<div className="rounded-2xl border border-slate-900/10 bg-white px-3 py-2">
			<div className="flex items-center gap-2 text-slate-500">
				<Icon className="size-4" />
				<span className="text-[11px] uppercase tracking-wide">{label}</span>
			</div>
			<p className="truncate text-sm font-semibold text-slate-900">{value}</p>
		</div>
	);
}
