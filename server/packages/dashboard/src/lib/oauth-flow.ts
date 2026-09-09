export function oauthRedirectUrl(data: unknown) {
	if (!data || typeof data !== "object")
		throw new Error(
			"The authorization response was incomplete. Restart the connection from your agent.",
		);
	const result = data as { url?: unknown; redirect_uri?: unknown };
	const url = result.url ?? result.redirect_uri;
	if (typeof url !== "string" || !url)
		throw new Error(
			"The authorization response was incomplete. Restart the connection from your agent.",
		);
	return url;
}

// Redirects only use Better Auth's response after it verifies the signed flow
// and the registered client's exact redirect URI.
export function continueOAuthRedirect(data: unknown) {
	window.location.assign(oauthRedirectUrl(data));
}
