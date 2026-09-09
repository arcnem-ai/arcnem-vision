import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

export function pinnedMetadataDestination(
	url: URL,
	addresses: { address: string; family: number }[],
) {
	if (url.protocol !== "https:" || url.username || url.password || url.hash)
		throw new TypeError(
			"Client metadata requires an HTTPS URL without credentials or fragment",
		);
	if (
		!addresses.length ||
		addresses.some(({ address }) => !isPublicRoutableHost(address))
	)
		throw new TypeError(
			"Client metadata must resolve only to public addresses",
		);
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	return {
		hostname: addresses[0].address,
		port: url.port || 443,
		servername: isIP(hostname) ? undefined : hostname,
		path: `${url.pathname}${url.search}`,
	};
}

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
	const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
		all: true,
		verbatim: true,
	});
	const destination = pinnedMetadataDestination(url, addresses);
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
