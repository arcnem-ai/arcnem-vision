const HOP_BY_HOP_RESPONSE_HEADERS = [
	"connection",
	"content-length",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"trailers",
	"transfer-encoding",
	"upgrade",
] as const;

export function createProxyRequestHeaders(
	request: Request,
	cookieHeader: string,
	forwardedHeaderNames: string[],
) {
	const headers = new Headers();
	headers.set("cookie", cookieHeader);

	for (const headerName of forwardedHeaderNames) {
		const headerValue = request.headers.get(headerName);
		if (headerValue) {
			headers.set(headerName, headerValue);
		}
	}

	return headers;
}

export function sanitizeProxyResponseHeaders(upstreamHeaders: Headers) {
	const headers = new Headers(upstreamHeaders);

	for (const headerName of HOP_BY_HOP_RESPONSE_HEADERS) {
		headers.delete(headerName);
	}

	return headers;
}

// Pass the upstream body straight through so a client disconnect cancels the
// upstream stream (and the API's realtime subscription) instead of leaving it
// open behind a locked reader.
export function createProxyResponse(upstreamResponse: Response) {
	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: sanitizeProxyResponseHeaders(upstreamResponse.headers),
	});
}
