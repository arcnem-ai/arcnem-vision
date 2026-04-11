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

export function createProxyResponse(upstreamResponse: Response) {
	const upstreamBody = upstreamResponse.body;
	const body = upstreamBody
		? new ReadableStream<Uint8Array>({
				start(controller) {
					const reader = upstreamBody.getReader();

					void (async () => {
						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) {
									break;
								}
								controller.enqueue(value);
							}
							controller.close();
						} catch (error) {
							controller.error(error);
						} finally {
							reader.releaseLock();
						}
					})();
				},
				async cancel(reason) {
					try {
						await upstreamBody.cancel(reason);
					} catch {
						// best effort cleanup
					}
				},
			})
		: null;

	return new Response(body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: sanitizeProxyResponseHeaders(upstreamResponse.headers),
	});
}
