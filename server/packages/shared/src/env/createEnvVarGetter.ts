import { getEnvVar } from "./getEnvVar";

export const createEnvVarGetter = <const T extends Record<string, string>>(
	_envVars: T,
): ((envVar: T[keyof T]) => string) => {
	return (envVar: T[keyof T]): string => getEnvVar(envVar);
};
