export const getEnvVar = <T extends string>(envVar: T): string => {
	const value = process.env[envVar];
	if (!value) {
		throw new Error(`Environment variable ${envVar} is not defined`);
	}

	return value;
};
