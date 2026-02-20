import {
	Bot,
	CircleDotDashed,
	ShieldUser,
	Sparkles,
	Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nodeStyle = {
	worker: {
		label: "Worker",
		icon: Bot,
		className: "bg-amber-100 text-amber-900 border-amber-300",
	},
	supervisor: {
		label: "Supervisor",
		icon: ShieldUser,
		className: "bg-sky-100 text-sky-900 border-sky-300",
	},
	tool: {
		label: "Tool",
		icon: Wrench,
		className: "bg-emerald-100 text-emerald-900 border-emerald-300",
	},
	other: {
		label: "Node",
		icon: CircleDotDashed,
		className: "bg-zinc-100 text-zinc-900 border-zinc-300",
	},
} as const;

export function NodeCharacter({
	nodeType,
	nodeKey,
	toolNames,
}: {
	nodeType: string;
	nodeKey: string;
	toolNames: string[];
}) {
	const style =
		nodeStyle[nodeType as keyof typeof nodeStyle] ?? nodeStyle.other;
	const Icon = style.icon;

	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-xl border p-3 transition-transform hover:-translate-y-0.5",
				style.className,
			)}
		>
			<div className="rounded-full border border-current/40 bg-white/60 p-2">
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold">{nodeKey}</p>
				<p className="text-xs opacity-80">{style.label}</p>
				{toolNames.length > 0 ? (
					<p className="mt-1 truncate text-[11px] opacity-80">
						<Sparkles className="mr-1 inline size-3" />
						{toolNames.join(", ")}
					</p>
				) : null}
			</div>
		</div>
	);
}
