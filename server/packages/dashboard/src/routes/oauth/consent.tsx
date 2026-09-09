import type { OAuthClient } from "@better-auth/oauth-provider";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { continueOAuthRedirect } from "@/lib/oauth-flow";

export const Route = createFileRoute("/oauth/consent")({
	component: OAuthConsent,
});

const scopeDescriptions: Record<string, string> = {
	"projects:read": "List projects you can access",
	"workflows:read":
		"Read workflows, model and tool configuration, and execution results",
	"workflows:write": "Create and edit workflows, affecting future executions",
	"workflows:execute":
		"Run workflows on your documents, using configured model providers",
	"documents:list": "List documents in your projects",
	"documents:search": "Search documents in your projects",
	"documents:read": "Read documents and extracted content",
	offline_access: "Keep this connection active until you revoke it",
};

function OAuthConsent() {
	const [client, setClient] = useState<OAuthClient | null>(null);
	const [scopes, setScopes] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	useEffect(() => {
		let cancelled = false;
		const params = new URLSearchParams(window.location.search);
		const clientId = params.get("client_id");
		if (!clientId || !params.has("sig")) {
			setError(
				"This authorization request is incomplete. Restart the connection from your agent.",
			);
			return;
		}
		setScopes([
			...new Set((params.get("scope") ?? "").split(/\s+/).filter(Boolean)),
		]);
		void authClient.oauth2
			.publicClient({ query: { client_id: clientId } })
			.then(({ data, error }) => {
				if (cancelled) return;
				if (error)
					setError(error.message ?? "Sign in again to review this request.");
				else setClient(data);
			})
			.catch(() => {
				if (!cancelled)
					setError(
						"Could not load the application. Reload this page to try again.",
					);
			});
		return () => {
			cancelled = true;
		};
	}, []);
	const respond = async (accept: boolean) => {
		setPending(true);
		setError(null);
		try {
			const { data, error } = await authClient.oauth2.consent({ accept });
			if (error)
				throw new Error(error.message ?? "Could not save your decision.");
			continueOAuthRedirect(data);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Could not complete authorization.",
			);
			setPending(false);
		}
	};
	return (
		<main className="mx-auto max-w-xl space-y-6 px-6 py-16">
			<h1 className="text-2xl font-semibold">Allow access to Vision?</h1>
			{client ? (
				<>
					<p>
						<strong>{client.client_name || "This application"}</strong> is
						requesting access on your behalf.
					</p>
					<p className="break-all text-sm text-slate-500">{client.client_id}</p>
					<ul className="list-disc space-y-2 pl-5">
						{scopes.map((scope) => (
							<li key={scope}>{scopeDescriptions[scope] ?? scope}</li>
						))}
					</ul>
					<p className="text-sm text-slate-600">
						Access follows your current organization memberships.
					</p>
					<div className="flex gap-3">
						<Button disabled={pending} onClick={() => void respond(true)}>
							Allow access
						</Button>
						<Button
							disabled={pending}
							variant="outline"
							onClick={() => void respond(false)}
						>
							Deny
						</Button>
					</div>
				</>
			) : !error ? (
				<p>Loading application…</p>
			) : null}
			{error ? (
				<p role="alert" className="text-red-700">
					{error}
				</p>
			) : null}
		</main>
	);
}
