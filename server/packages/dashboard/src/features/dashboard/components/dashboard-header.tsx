import { Badge } from "@/components/ui/badge";

export function DashboardHeader() {
	return (
		<section className="overflow-hidden rounded-3xl border border-slate-900/10 bg-white/80 p-6 shadow-[0_20px_50px_rgba(14,165,233,0.12)] backdrop-blur-sm sm:p-8">
			<div className="min-w-0 space-y-3">
				<div className="flex flex-wrap items-center gap-3">
					<img src="/arcnem-logo.svg" alt="Arcnem" className="h-10 w-10" />
					<Badge className="rounded-full border-slate-900/10 bg-slate-900/5 text-slate-800 hover:bg-slate-900/10">
						Friendly Workflow Deck
					</Badge>
				</div>
				<h1 className="font-display text-balance text-2xl leading-tight sm:text-3xl lg:text-4xl">
					Coordinate projects, devices, and agent workflows from one
					approachable control room.
				</h1>
				<p className="max-w-2xl text-sm text-slate-600 sm:text-base">
					Pick a project, check connected devices, then attach or design
					workflows that best fit each device.
				</p>
			</div>
		</section>
	);
}
