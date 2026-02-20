import { createEnvVarGetter } from "@arcnem-vision/shared";
import { DB_ENV_VAR } from "./dbEnvVar";

export const getDBEnvVar = createEnvVarGetter(DB_ENV_VAR);
