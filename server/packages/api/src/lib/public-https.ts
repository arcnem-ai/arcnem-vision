import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { isPublicRoutableHost } from "@better-auth/core/utils/host";

export type PinnedHttpsDestination = {
	hostname: string;
	port: string | number;
	servername: string | undefined;
	path: string;
};

// Connect to an address that was checked here, never to a second DNS answer.
export function pinnedPublicHttpsDestination(
	url: URL,
	addresses: { address: string; family: number }[],
): PinnedHttpsDestination {
	if (url.protocol !== "https:" || url.username || url.password || url.hash)
		throw new TypeError(
			"Destination requires an HTTPS URL without credentials or fragment",
		);
	if (
		!addresses.length ||
		addresses.some(({ address }) => !isPublicRoutableHost(address))
	)
		throw new TypeError("Destination must resolve only to public addresses");
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	return {
		hostname: addresses[0].address,
		port: url.port || 443,
		servername: isIP(hostname) ? undefined : hostname,
		path: `${url.pathname}${url.search}`,
	};
}

export async function resolvePublicHttpsDestination(url: URL) {
	const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
		all: true,
		verbatim: true,
	});
	return pinnedPublicHttpsDestination(url, addresses);
}

export type PublicHttpsPostResult =
	| { kind: "response"; status: number }
	| {
			kind: "error";
			category: "dns" | "blocked_destination" | "timeout" | "network";
	  };

class DeadlineExceeded extends Error {}

// POSTs to a pinned public HTTPS destination within one deadline covering DNS,
// connection, TLS and response headers. The response body is never read.
export async function postToPublicHttps(input: {
	url: URL;
	headers: Record<string, string>;
	body: string;
	timeoutMs: number;
}): Promise<PublicHttpsPostResult> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new DeadlineExceeded()), input.timeoutMs);
	});
	try {
		let destination: PinnedHttpsDestination;
		try {
			destination = await Promise.race([
				resolvePublicHttpsDestination(input.url),
				deadline,
			]);
		} catch (error) {
			if (error instanceof DeadlineExceeded)
				return { kind: "error", category: "timeout" };
			if (error instanceof TypeError)
				return { kind: "error", category: "blocked_destination" };
			return { kind: "error", category: "dns" };
		}

		const body = Buffer.from(input.body);
		let outgoing: ReturnType<typeof request> | undefined;
		const response = new Promise<PublicHttpsPostResult>((resolve) => {
			outgoing = request(
				{
					...destination,
					agent: false,
					method: "POST",
					headers: {
						...input.headers,
						host: input.url.host,
						"content-length": String(body.byteLength),
					},
				},
				(incoming) => {
					resolve({ kind: "response", status: incoming.statusCode ?? 0 });
					incoming.destroy();
				},
			);
			outgoing.once("error", () =>
				resolve({ kind: "error", category: "network" }),
			);
			outgoing.end(body);
		});
		try {
			return await Promise.race([response, deadline]);
		} catch {
			outgoing?.destroy();
			return { kind: "error", category: "timeout" };
		}
	} finally {
		clearTimeout(timer);
	}
}
