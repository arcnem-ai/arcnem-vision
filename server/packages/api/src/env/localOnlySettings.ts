import { getAPIEnvVar } from "./getAPIEnvVar";

// Debug mode bypasses session checks, accepts disabled keys and reflects any
// CORS origin. It exists for the local seed and must never reach a deployment.
export const isAPIDebugModeEnabled = (): boolean => {
	return process.env.API_DEBUG === "true";
};

// Lets webhooks reach plain-HTTP and private-network receivers, such as a
// receiver on localhost during development.
export const allowsPrivateWebhookDestinations = (): boolean => {
	return process.env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS === "true";
};

function isLocalHttpURL(value: string) {
	const url = new URL(value);
	const hostname = url.hostname;
	return (
		url.protocol === "http:" &&
		(hostname === "localhost" ||
			hostname.endsWith(".localhost") ||
			hostname === "127.0.0.1" ||
			hostname === "[::1]")
	);
}

// Refuse to start when a local-only switch is on and the API's own base URL
// is not a local http address.
export function assertLocalOnlySettings(
	baseURL = getAPIEnvVar("BETTER_AUTH_BASE_URL"),
) {
	const enabled = [
		isAPIDebugModeEnabled() && "API_DEBUG",
		allowsPrivateWebhookDestinations() && "WEBHOOK_ALLOW_PRIVATE_DESTINATIONS",
	].filter(Boolean);
	if (enabled.length > 0 && !isLocalHttpURL(baseURL)) {
		throw new Error(
			`${enabled.join(" and ")} can only be enabled when BETTER_AUTH_BASE_URL is a local http URL (got ${baseURL})`,
		);
	}
}
