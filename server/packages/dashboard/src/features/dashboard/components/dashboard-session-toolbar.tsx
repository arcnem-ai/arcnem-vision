import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, LogOut, Sparkles, UserCircle2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { switchActiveOrganization } from "@/features/dashboard/server-fns";
import type { DashboardData } from "@/features/dashboard/types";
import { signOut } from "@/lib/auth-client";

function fallbackDisplayName(name: string | null, email: string | null) {
	if (name && name.trim().length > 0) {
		return name;
	}

	if (!email) {
		return "Signed-in user";
	}

	return email.split("@")[0] || email;
}

function errorMessage(error: unknown, fallback: string) {
	if (
		error &&
		typeof error === "object" &&
		"message" in error &&
		typeof error.message === "string" &&
		error.message.trim().length > 0
	) {
		return error.message;
	}

	return fallback;
}

export function DashboardSessionToolbar({
	auth,
	organizations,
	currentOrganizationId,
}: Pick<DashboardData, "auth" | "organizations"> & {
	currentOrganizationId: string | null;
}) {
	const router = useRouter();
	const switchOrganizationFn = useServerFn(switchActiveOrganization);
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [switchError, setSwitchError] = useState<string | null>(null);
	const [pendingOrganizationId, setPendingOrganizationId] = useState<
		string | null
	>(null);

	const displayName = fallbackDisplayName(auth.userName, auth.userEmail);
	const currentOrganization =
		organizations.find(
			(organization) => organization.id === currentOrganizationId,
		) ?? null;
	const signedInViaFallback = auth.source === "fallback";

	const handleSwitchOrganization = async (organizationId: string) => {
		if (!organizationId || organizationId === currentOrganizationId) {
			return;
		}

		setPendingOrganizationId(organizationId);
		setSwitchError(null);

		try {
			await switchOrganizationFn({
				data: {
					organizationId,
				},
			});
			await router.invalidate();
		} catch (caughtError) {
			setSwitchError(
				errorMessage(
					caughtError,
					"Could not switch organizations. Please try again.",
				),
			);
		} finally {
			setPendingOrganizationId(null);
		}
	};

	const handleSignOut = async () => {
		setIsSigningOut(true);
		setSwitchError(null);

		try {
			const { error } = await signOut();
			if (error) {
				throw error;
			}
			await router.invalidate();
		} catch (caughtError) {
			setSwitchError(
				errorMessage(caughtError, "Could not sign out cleanly. Try again."),
			);
		} finally {
			setIsSigningOut(false);
		}
	};

	return (
		<div className="space-y-3">
			<Card className="border-slate-200/70 bg-white/82 px-4 py-4 shadow-sm backdrop-blur-sm sm:px-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex min-w-0 items-start gap-3">
						<div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
							<UserCircle2 className="size-6" />
						</div>
						<div className="min-w-0 space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<p className="truncate font-medium text-slate-900">
									{displayName}
								</p>
								{signedInViaFallback ? (
									<Badge className="rounded-full border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
										Local debug session
									</Badge>
								) : null}
							</div>
							<p className="truncate text-sm text-slate-500">
								{auth.userEmail}
							</p>
						</div>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						<div className="min-w-0 space-y-1">
							<p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
								Active organization
							</p>
							{organizations.length > 1 ? (
								<Select
									value={currentOrganizationId ?? ""}
									onValueChange={handleSwitchOrganization}
									disabled={pendingOrganizationId !== null}
								>
									<SelectTrigger className="h-10 min-w-60 rounded-xl border-slate-200 bg-white">
										<SelectValue placeholder="Select an organization" />
									</SelectTrigger>
									<SelectContent>
										{organizations.map((organization) => (
											<SelectItem key={organization.id} value={organization.id}>
												{organization.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : currentOrganization ? (
								<div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
									<Building2 className="size-4 text-slate-500" />
									<span className="text-sm font-medium text-slate-700">
										{currentOrganization.name}
									</span>
									<Badge className="rounded-full border-slate-200 bg-white text-slate-600 hover:bg-white">
										{currentOrganization.role}
									</Badge>
								</div>
							) : (
								<div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
									<Sparkles className="size-4" />
									<span>Create an organization to get started.</span>
								</div>
							)}
						</div>

						{signedInViaFallback ? null : (
							<Button
								type="button"
								variant="outline"
								className="h-10 rounded-xl px-4"
								onClick={handleSignOut}
								disabled={isSigningOut}
							>
								<LogOut className="size-4" />
								{isSigningOut ? "Signing out…" : "Sign out"}
							</Button>
						)}
					</div>
				</div>
			</Card>

			{switchError ? (
				<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{switchError}
				</div>
			) : null}
		</div>
	);
}
