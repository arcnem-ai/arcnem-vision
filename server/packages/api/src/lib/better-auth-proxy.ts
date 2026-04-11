import { getAPIEnvVar } from "@/env/getAPIEnvVar";

function extractErrorMessage(payload: unknown): string | null {
	if (typeof payload === "string") {
		return payload.trim() || null;
	}
	if (!payload || typeof payload !== "object") {
		return null;
	}

	const record = payload as Record<string, unknown>;
	if (typeof record.message === "string" && record.message.trim()) {
		return record.message;
	}
	if (
		record.error &&
		typeof record.error === "object" &&
		"message" in record.error &&
		typeof record.error.message === "string" &&
		record.error.message.trim()
	) {
		return record.error.message;
	}

	return null;
}

function parseAuthResponseBody(body: string): unknown {
	const text = body.trim();
	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

export async function proxyBetterAuthRequest<T>(
	request: Request,
	path: string,
	init: RequestInit,
): Promise<
	{ ok: true; data: T } | { ok: false; status: number; message: string }
> {
	const headers = new Headers(init.headers);
	const cookieHeader = request.headers.get("cookie");
	if (cookieHeader) {
		headers.set("cookie", cookieHeader);
	}
	if (init.body && !headers.has("content-type")) {
		headers.set("content-type", "application/json");
	}
	if (!headers.has("origin")) {
		headers.set(
			"origin",
			request.headers.get("origin") ?? getAPIEnvVar("BETTER_AUTH_BASE_URL"),
		);
	}

	const response = await fetch(
		`${getAPIEnvVar("BETTER_AUTH_BASE_URL")}/api/auth${path}`,
		{
			...init,
			headers,
		},
	);

	const text = await response.text();
	const payload = parseAuthResponseBody(text);
	if (!response.ok) {
		return {
			ok: false,
			status: response.status,
			message:
				extractErrorMessage(payload) ??
				`${response.status} ${response.statusText}`.trim(),
		};
	}

	return {
		ok: true,
		data: payload as T,
	};
}
