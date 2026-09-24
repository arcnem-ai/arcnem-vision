import { request } from "node:https";
import { Readable } from "node:stream";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { resolvePublicHttpsDestination } from "@/lib/public-https";

// Bun's HTTPS adapter receives the approved IP directly, with the original TLS
// identity and Host preserved. No second DNS lookup and no redirect following.
export const fetchOAuthClientMetadata: ClientMetadataResourceFetch = async (
	input,
	init,
) => {
	const webRequest = new Request(input, init);
	const url = new URL(webRequest.url);
	if (url.protocol !== "https:")
		throw new TypeError("Client metadata requires HTTPS");
	if (!["GET", "HEAD"].includes(webRequest.method))
		throw new TypeError("Unsupported metadata method");
	const destination = await resolvePublicHttpsDestination(url);
	return new Promise((resolve, reject) => {
		const outgoing = request(
			{
				...destination,
				agent: false,
				method: webRequest.method,
				headers: { ...Object.fromEntries(webRequest.headers), host: url.host },
				signal: webRequest.signal,
			},
			(incoming) => {
				const headers = new Headers();
				for (const [name, value] of Object.entries(incoming.headers)) {
					if (Array.isArray(value))
						for (const item of value) headers.append(name, item);
					else if (value !== undefined) headers.set(name, value);
				}
				const status = incoming.statusCode ?? 502;
				resolve(
					new Response(
						webRequest.method === "HEAD" || [204, 205, 304].includes(status)
							? null
							: (Readable.toWeb(incoming) as unknown as ReadableStream),
						{ status, headers },
					),
				);
			},
		);
		outgoing.once("error", reject);
		outgoing.end();
	});
};
