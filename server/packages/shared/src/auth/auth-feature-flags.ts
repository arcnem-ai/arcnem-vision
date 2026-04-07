function parseBooleanEnvVar(value: string | undefined, defaultValue: boolean) {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) {
		return defaultValue;
	}

	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}

	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}

	return defaultValue;
}

export function getAuthFeatureFlags() {
	return {
		signUpEnabled: parseBooleanEnvVar(process.env.AUTH_ENABLE_SIGN_UP, true),
		organizationCreationEnabled: parseBooleanEnvVar(
			process.env.AUTH_ENABLE_ORGANIZATION_CREATION,
			true,
		),
	};
}
