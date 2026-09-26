// Open sign-up lets anyone use the operator's model keys, so a deployment has
// to choose these values explicitly.
function requireBooleanEnvVar(name: string) {
	const value = process.env[name]?.trim();
	if (value === "true") return true;
	if (value === "false") return false;
	throw new Error(`${name} must be set to "true" or "false"`);
}

export function getAuthFeatureFlags() {
	return {
		signUpEnabled: requireBooleanEnvVar("AUTH_ENABLE_SIGN_UP"),
		organizationCreationEnabled: requireBooleanEnvVar(
			"AUTH_ENABLE_ORGANIZATION_CREATION",
		),
	};
}
