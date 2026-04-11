import type { ZodType } from "zod";
import { DASHBOARD_ENV_VAR } from "@/env/dashboardEnvVar";
import { getDashboardEnvVar } from "@/env/getDashboardEnvVar";
import { getDashboardSessionCookieHeader } from "@/features/dashboard/server/better-auth-api";

const API_URL = getDashboardEnvVar(DASHBOARD_ENV_VAR.API_URL);

type DashboardAPIRequestInit = Omit<RequestInit, "body" | "headers"> & {
	allowUnauthenticated?: boolean;
	body?: unknown;
	headers?: HeadersInit;
	fallbackErrorMessage?: string;
};

function buildAPIURL(path: string) {
	return `${API_URL}/api${path}`;
}

function serializeRequestBody(body: unknown): BodyInit | undefined {
	if (body === undefined) {
		return undefined;
	}

	return typeof body === "string" ? body : JSON.stringify(body);
}

function buildRequestHeaders(
	headersInit: HeadersInit | undefined,
	cookieHeader: string | null,
	body: BodyInit | undefined,
) {
	const headers = new Headers(headersInit);
	if (cookieHeader) {
		headers.set("Cookie", cookieHeader);
	}

	if (body !== undefined && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	return headers;
}

function extractAPIErrorMessage(payload: unknown): string | null {
	if (typeof payload === "string") {
		const message = payload.trim();
		return message.length > 0 ? message : null;
	}

	if (!payload || typeof payload !== "object") {
		return null;
	}

	const record = payload as Record<string, unknown>;

	return (
		extractAPIErrorMessage(record.message) ??
		extractAPIErrorMessage(record.error)
	);
}

async function readAPIErrorMessage(
	response: Response,
	fallbackMessage: string,
): Promise<string> {
	const responseText = (await response.text()).trim();
	if (responseText.length === 0) {
		return fallbackMessage;
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return responseText;
	}

	try {
		return extractAPIErrorMessage(JSON.parse(responseText)) ?? responseText;
	} catch {
		return responseText;
	}
}

export async function fetchDashboardAPI<T = Record<string, unknown>>(
	path: string,
	init: DashboardAPIRequestInit,
	responseSchema?: ZodType<T>,
): Promise<T> {
	const cookieHeader = await getDashboardSessionCookieHeader();
	if (!cookieHeader && init.allowUnauthenticated !== true) {
		throw new Error("No active dashboard session.");
	}

	const body = serializeRequestBody(init.body);
	const headers = buildRequestHeaders(init.headers, cookieHeader, body);

	const response = await fetch(buildAPIURL(path), {
		...init,
		body,
		headers,
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(
			await readAPIErrorMessage(
				response,
				init.fallbackErrorMessage ??
					`${response.status} ${response.statusText}`.trim(),
			),
		);
	}

	const payload = (await response.json()) as unknown;
	return responseSchema ? responseSchema.parse(payload) : (payload as T);
}
