const SESSION_COOKIE_NAME = "better-auth.session_token";
const SECURE_SESSION_COOKIE_NAME = "__Secure-better-auth.session_token";

function extractCookiePair(candidate: string) {
	const cookiePair = candidate.split(";", 1)[0]?.trim() ?? "";
	return cookiePair.length > 0 ? cookiePair : null;
}

export function readCookieFromHeader(
	cookieHeader: string | undefined,
	cookieName: string,
) {
	if (!cookieHeader) {
		return null;
	}

	for (const segment of cookieHeader.split(";")) {
		const trimmedSegment = segment.trim();
		if (!trimmedSegment.startsWith(`${cookieName}=`)) {
			continue;
		}

		return trimmedSegment.slice(cookieName.length + 1);
	}

	return null;
}

export function readDashboardSessionCookie(cookieHeader: string | undefined) {
	return (
		readCookieFromHeader(cookieHeader, SESSION_COOKIE_NAME) ??
		readCookieFromHeader(cookieHeader, SECURE_SESSION_COOKIE_NAME)
	);
}

export function extractDashboardSessionCookiePair(setCookieHeaders: string[]) {
	for (const header of setCookieHeaders) {
		const cookiePair = extractCookiePair(header);
		if (!cookiePair) {
			continue;
		}

		if (
			cookiePair.startsWith(`${SESSION_COOKIE_NAME}=`) ||
			cookiePair.startsWith(`${SECURE_SESSION_COOKIE_NAME}=`)
		) {
			return cookiePair;
		}
	}

	return null;
}
