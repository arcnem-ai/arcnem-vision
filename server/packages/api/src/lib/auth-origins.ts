import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { isAPIDebugModeEnabled } from "@/env/isAPIDebugModeEnabled";

function readOptionalOrigins(value: string | undefined) {
	return (value ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);
}

export function getTrustedOrigins() {
	if (isAPIDebugModeEnabled()) {
		return ["*"];
	}

	const origins = new Set<string>();
	origins.add(getAPIEnvVar("CLIENT_ORIGIN"));
	origins.add(getAPIEnvVar("DASHBOARD_ORIGIN"));

	for (const origin of readOptionalOrigins(process.env.TRUSTED_ORIGINS)) {
		origins.add(origin);
	}

	return Array.from(origins);
}

export function isTrustedOrigin(origin: string | undefined) {
	if (!origin) {
		return false;
	}

	if (isAPIDebugModeEnabled()) {
		return true;
	}

	return getTrustedOrigins().includes(origin);
}
