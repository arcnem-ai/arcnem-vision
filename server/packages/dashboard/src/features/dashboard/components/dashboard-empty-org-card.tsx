import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardEmptyOrgCard({ message }: { message: string }) {
	return (
		<Card className="border-slate-200/60 bg-white/80 py-16 text-center shadow-sm">
			<CardContent>
				<div className="flex flex-col items-center gap-3">
					<div className="rounded-2xl bg-slate-100 p-4">
						<Building2 className="size-8 text-slate-300" />
					</div>
					<div>
						<p className="font-medium text-slate-500">
							No organization selected
						</p>
						<p className="mt-1 text-sm text-muted-foreground">{message}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
