import { getRequestHeader } from "@tanstack/react-start/server";
import { DASHBOARD_ENV_VAR } from "@/env/dashboardEnvVar";
import { getDashboardEnvVar } from "@/env/getDashboardEnvVar";
import {
	extractDashboardSessionCookiePair,
	readDashboardSessionCookie,
} from "./session-cookie";

const API_URL = getDashboardEnvVar(DASHBOARD_ENV_VAR.API_URL);

type DashboardAuthRequestContext = {
	source: "cookie" | "fallback" | "none";
	cookieHeader: string | null;
};

type BetterAuthSessionResponse = {
	session: {
		id: string;
		userId: string;
		token: string;
		activeOrganizationId: string | null;
		userAgent?: string | null;
	} | null;
	user: {
		id: string;
		name: string | null;
		email: string;
	} | null;
} | null;

export type BetterAuthOrganization = {
	id: string;
	name: string;
	slug: string;
};

function getDashboardRequestOrigin() {
	const explicitOrigin = getRequestHeader("origin")?.trim();
	if (explicitOrigin) {
		return explicitOrigin;
	}

	const host = getRequestHeader("host")?.trim();
	if (!host) {
		return null;
	}

	const forwardedProto = getRequestHeader("x-forwarded-proto")?.trim();
	const protocol =
		forwardedProto || (host.startsWith("localhost") ? "http" : "https");
	return `${protocol}://${host}`;
}

function readSetCookieHeaders(headers: Headers) {
	const headerBag = headers as Headers & {
		getSetCookie?: () => string[];
	};
	if (typeof headerBag.getSetCookie === "function") {
		const setCookieHeaders = headerBag
			.getSetCookie()
			.map((header) => header.trim())
			.filter(Boolean);
		if (setCookieHeaders.length > 0) {
			return setCookieHeaders;
		}
	}

	const setCookieHeader = headers.get("set-cookie")?.trim();
	return setCookieHeader ? [setCookieHeader] : [];
}

async function fetchDebugSessionCookieHeader() {
	const response = await fetch(`${API_URL}/api/auth/debug/session`, {
		method: "GET",
		cache: "no-store",
	});

	if (!response.ok) {
		return null;
	}

	return extractDashboardSessionCookiePair(
		readSetCookieHeaders(response.headers),
	);
}

async function getDashboardAuthRequestContext(): Promise<DashboardAuthRequestContext> {
	const incomingCookieHeader = getRequestHeader("cookie")?.trim() || null;
	if (readDashboardSessionCookie(incomingCookieHeader ?? undefined)) {
		return {
			source: "cookie",
			cookieHeader: incomingCookieHeader,
		};
	}

	const debugCookieHeader = await fetchDebugSessionCookieHeader();
	if (debugCookieHeader) {
		return {
			source: "fallback",
			cookieHeader: debugCookieHeader,
		};
	}

	return {
		source: "none",
		cookieHeader: null,
	};
}

async function parseErrorMessage(
	response: Response,
	fallbackMessage: string,
): Promise<string> {
	try {
		const payload = (await response.json()) as {
			message?: unknown;
			error?: { message?: unknown } | unknown;
		};
		if (
			typeof payload.message === "string" &&
			payload.message.trim().length > 0
		) {
			return payload.message;
		}
		if (
			payload.error &&
			typeof payload.error === "object" &&
			"message" in payload.error &&
			typeof payload.error.message === "string" &&
			payload.error.message.trim().length > 0
		) {
			return payload.error.message;
		}
	} catch {
		// fall through to the provided fallback
	}

	return fallbackMessage;
}

async function fetchBetterAuthEndpoint<T>(
	path: string,
	init: RequestInit & {
		allowUnauthorized?: boolean;
		fallbackErrorMessage?: string;
	} = {},
): Promise<T | null> {
	const { allowUnauthorized, fallbackErrorMessage, ...requestInit } = init;
	const authRequest = await getDashboardAuthRequestContext();
	if (!authRequest.cookieHeader) {
		if (allowUnauthorized) {
			return null;
		}

		throw new Error("No active dashboard session.");
	}

	const headers = new Headers(requestInit.headers);
	headers.set("cookie", authRequest.cookieHeader);
	if (requestInit.body && !headers.has("content-type")) {
		headers.set("content-type", "application/json");
	}
	const method = (requestInit.method || "GET").toUpperCase();
	if (method !== "GET" && method !== "HEAD" && !headers.has("origin")) {
		const origin = getDashboardRequestOrigin();
		if (origin) {
			headers.set("origin", origin);
		}
	}

	const response = await fetch(`${API_URL}/api/auth${path}`, {
		...requestInit,
		headers,
		cache: "no-store",
	});

	if (
		allowUnauthorized &&
		(response.status === 401 || response.status === 403)
	) {
		return null;
	}

	if (!response.ok) {
		throw new Error(
			await parseErrorMessage(
				response,
				fallbackErrorMessage ??
					`${response.status} ${response.statusText}`.trim(),
			),
		);
	}

	return (await response.json()) as T;
}

export async function getDashboardSessionCookieHeader() {
	const authRequest = await getDashboardAuthRequestContext();
	return authRequest.cookieHeader;
}

export async function getBetterAuthSession() {
	const authRequest = await getDashboardAuthRequestContext();
	const payload = await fetchBetterAuthEndpoint<BetterAuthSessionResponse>(
		"/get-session",
		{
			method: "GET",
			allowUnauthorized: true,
			fallbackErrorMessage: "Failed to resolve the dashboard session.",
		},
	);

	return {
		source: authRequest.source,
		payload,
	};
}

export async function listBetterAuthOrganizations() {
	return (
		(await fetchBetterAuthEndpoint<BetterAuthOrganization[]>(
			"/organization/list",
			{
				method: "GET",
				allowUnauthorized: true,
				fallbackErrorMessage: "Failed to load organizations.",
			},
		)) ?? []
	);
}

export async function createBetterAuthOrganization(input: {
	name: string;
	slug: string;
}) {
	return await fetchBetterAuthEndpoint<BetterAuthOrganization>(
		"/organization/create",
		{
			method: "POST",
			body: JSON.stringify(input),
			fallbackErrorMessage: "Failed to create organization.",
		},
	);
}

export async function setBetterAuthActiveOrganization(input: {
	organizationId: string;
}) {
	return await fetchBetterAuthEndpoint<BetterAuthOrganization>(
		"/organization/set-active",
		{
			method: "POST",
			body: JSON.stringify(input),
			fallbackErrorMessage: "Failed to switch organization.",
		},
	);
}
