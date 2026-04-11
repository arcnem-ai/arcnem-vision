import { describe, expect, test } from "bun:test";
import {
	extractDashboardSessionCookiePair,
	readCookieFromHeader,
	readDashboardSessionCookie,
} from "./session-cookie";

describe("readCookieFromHeader", () => {
	test("returns the named cookie value from a cookie header", () => {
		expect(
			readCookieFromHeader(
				"a=1; better-auth.session_token=token-123; b=2",
				"better-auth.session_token",
			),
		).toBe("token-123");
	});
});

describe("readDashboardSessionCookie", () => {
	test("supports both secure and non-secure dashboard session cookie names", () => {
		expect(
			readDashboardSessionCookie(
				"__Secure-better-auth.session_token=secure-token",
			),
		).toBe("secure-token");
		expect(
			readDashboardSessionCookie("better-auth.session_token=plain-token"),
		).toBe("plain-token");
	});
});

describe("extractDashboardSessionCookiePair", () => {
	test("extracts the session cookie pair from Set-Cookie headers", () => {
		expect(
			extractDashboardSessionCookiePair([
				"theme=light; Path=/; HttpOnly",
				"better-auth.session_token=debug-token; Path=/; HttpOnly; SameSite=Lax",
			]),
		).toBe("better-auth.session_token=debug-token");
	});
});
