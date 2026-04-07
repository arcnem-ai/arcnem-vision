import { emailOTPClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authAPIBaseURL =
	import.meta.env.VITE_API_URL?.trim() || "http://localhost:3000";

export const authClient = createAuthClient({
	baseURL: authAPIBaseURL,
	plugins: [emailOTPClient(), organizationClient()],
});

export const { signIn, signOut } = authClient;
