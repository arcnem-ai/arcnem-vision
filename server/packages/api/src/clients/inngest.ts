import { Inngest } from "inngest";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";

let inngestClient: Inngest | null = null;

export const getInngestClient = (): Inngest => {
	if (!inngestClient) {
		const INNGEST_APP_ID = getAPIEnvVar("INNGEST_APP_ID");

		inngestClient = new Inngest({ id: INNGEST_APP_ID });
	}

	return inngestClient;
};
