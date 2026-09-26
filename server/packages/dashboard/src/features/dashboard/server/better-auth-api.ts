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

export async function getDashboardSessionCookieHeader() {
	const authRequest = await getDashboardAuthRequestContext();
	return authRequest.cookieHeader;
}
