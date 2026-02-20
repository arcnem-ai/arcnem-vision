export const isAPIDebugModeEnabled = (): boolean => {
	return process.env.API_DEBUG === "true";
};
