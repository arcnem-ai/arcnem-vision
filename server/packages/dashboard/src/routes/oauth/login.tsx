import { createFileRoute } from "@tanstack/react-router";
import { DashboardAuthCard } from "@/features/dashboard/components/dashboard-auth-card";
import { continueOAuthRedirect } from "@/lib/oauth-flow";

export const Route = createFileRoute("/oauth/login")({ component: OAuthLogin });

function OAuthLogin() {
	return (
		<main className="mx-auto max-w-xl space-y-6 px-6 py-16">
			<div>
				<h1 className="text-2xl font-semibold">Connect your agent</h1>
				<p className="mt-2 text-slate-600">
					Sign in to review the access this application is requesting.
				</p>
			</div>
			<DashboardAuthCard
				signUpEnabled={false}
				organizationCreationEnabled={false}
				debugSessionBootstrapEnabled={false}
				onSignedIn={continueOAuthRedirect}
			/>
		</main>
	);
}
