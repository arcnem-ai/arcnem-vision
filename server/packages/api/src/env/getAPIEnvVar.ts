import { createEnvVarGetter } from "@arcnem-vision/shared";
import { API_ENV_VAR } from "./apiEnvVar";

export const getAPIEnvVar = createEnvVarGetter(API_ENV_VAR);
