import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createOrganization } from "@/features/dashboard/server-fns";

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

export function DashboardCreateOrganizationCard({
	userEmail,
	organizationCreationEnabled,
}: {
	userEmail: string | null;
	organizationCreationEnabled: boolean;
}) {
	const router = useRouter();
	const createOrganizationFn = useServerFn(createOrganization);
	const [name, setName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSubmitting(true);
		setError(null);

		try {
			await createOrganizationFn({
				data: {
					name,
				},
			});
			if (typeof window !== "undefined") {
				window.location.replace("/");
				return;
			}
			await router.invalidate();
		} catch (caughtError) {
			setError(
				errorMessage(
					caughtError,
					organizationCreationEnabled
						? "Could not create the organization. Please try again."
						: "Organization creation is disabled for this environment.",
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card className="border-amber-200/80 bg-white/92 shadow-[0_20px_50px_rgba(249,168,37,0.12)] backdrop-blur-sm">
			<CardHeader className="gap-4">
				<div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
					<Building2 className="size-6" />
				</div>
				<div className="space-y-2">
					<CardTitle className="font-display text-2xl">
						{organizationCreationEnabled
							? "Create your organization"
							: "Organization required"}
					</CardTitle>
					<CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
						{organizationCreationEnabled
							? userEmail
								? `${userEmail} is signed in, but it is not attached to any organization yet. Create one now to unlock the rest of the dashboard.`
								: "You are signed in, but this account is not attached to any organization yet. Create one now to unlock the rest of the dashboard."
							: userEmail
								? `${userEmail} is signed in, but it is not attached to any organization and self-service organization creation is disabled. Ask an administrator to add you to an organization.`
								: "You are signed in, but this account is not attached to any organization and self-service organization creation is disabled. Ask an administrator to add you to an organization."}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{error ? (
					<div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
						{error}
					</div>
				) : null}
				{organizationCreationEnabled ? (
					<form className="space-y-4" onSubmit={handleSubmit}>
						<div className="space-y-2">
							<label
								htmlFor="dashboard-organization-name"
								className="text-sm font-medium text-slate-700"
							>
								Organization name
							</label>
							<Input
								id="dashboard-organization-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Northwind Labs"
								className="h-11 rounded-xl border-slate-200"
								disabled={isSubmitting}
								required
							/>
							<p className="text-xs text-slate-500">
								A unique slug is generated automatically from this name.
							</p>
						</div>
						<Button
							type="submit"
							disabled={isSubmitting}
							className="h-11 rounded-xl px-5"
						>
							{isSubmitting ? "Creating organization…" : "Create organization"}
						</Button>
					</form>
				) : null}
			</CardContent>
		</Card>
	);
}
