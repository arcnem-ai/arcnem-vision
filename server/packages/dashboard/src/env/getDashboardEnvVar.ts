import { createEnvVarGetter } from "@arcnem-vision/shared";
import { DASHBOARD_ENV_VAR } from "./dashboardEnvVar";

export const getDashboardEnvVar = createEnvVarGetter(DASHBOARD_ENV_VAR);
