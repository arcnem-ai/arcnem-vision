import { type McpOptions, mcp } from "@better-auth/mcp";
import { getOAuthProviderApi } from "@better-auth/oauth-provider";
import { APIError, createAuthEndpoint } from "better-auth/api";
import {
	createDpopReplayStore,
	enforceDpopBinding,
	parseAccessTokenAuthorization,
} from "better-auth/oauth2";
import { z } from "zod";

export const MCP_SCOPES = [
	"projects:read",
	"workflows:read",
	"workflows:write",
	"workflows:execute",
	"documents:list",
	"documents:search",
	"documents:read",
] as const;

export type McpPrincipal = {
	userId: string;
	clientId: string;
	scopes: string[];
};

export function createMcpAuthPlugins(
	options: Pick<McpOptions, "resource" | "loginPage" | "consentPage">,
) {
	const provider = mcp({
		...options,
		scopes: ["offline_access", ...MCP_SCOPES],
		grantTypes: ["authorization_code", "refresh_token"],
		// Opaque tokens let revocation take effect on the very next MCP request.
		disableJwtPlugin: true,
		storeTokens: "hashed",
		customAccessTokenClaims: ({ user }) => {
			// The provider reloads this user for each opaque-token verification.
			const banExpires = user?.banExpires as Date | null | undefined;
			if (
				!user ||
				(user.banned === true && (!banExpires || banExpires > new Date()))
			) {
				throw new APIError("UNAUTHORIZED", { error: "invalid_token" });
			}
			return {};
		},
		accessTokenExpiresIn: 60 * 60,
		refreshTokenExpiresIn: 60 * 60 * 24 * 30,
		refreshTokenReuseInterval: 0,
		clientRegistrationDefaultScopes: [...MCP_SCOPES],
		clientRegistrationAllowedScopes: ["offline_access", ...MCP_SCOPES],
		clientRegistrationAllowedResources: [options.resource],
		enforcePerClientResources: true,
		clientPrivileges: async () => false,
	});
	const boundary = {
		id: "vision-mcp-resource",
		endpoints: {
			verifyMcpRequest: createAuthEndpoint.serverOnly(
				{
					method: "POST",
					body: z.object({
						authorization: z.string(),
						dpop: z.string().nullable(),
						method: z.string(),
						url: z.string(),
					}),
				},
				async (ctx): Promise<McpPrincipal> => {
					const authorization = parseAccessTokenAuthorization(
						ctx.body.authorization,
					);
					if (
						!authorization ||
						!["Bearer", "DPoP"].includes(authorization.scheme)
					)
						throw new APIError("UNAUTHORIZED", { error: "invalid_token" });
					const claims = await getOAuthProviderApi(
						ctx,
						provider.options,
					).requireActiveAccessToken(authorization.token);
					const audiences = Array.isArray(claims.aud)
						? claims.aud
						: [claims.aud];
					if (
						claims.iss !== ctx.context.baseURL ||
						audiences.length !== 1 ||
						audiences[0] !== options.resource ||
						typeof claims.exp !== "number" ||
						claims.exp <= Date.now() / 1000 ||
						typeof claims.sub !== "string" ||
						typeof claims.client_id !== "string" ||
						typeof claims.scope !== "string"
					) {
						throw new APIError("UNAUTHORIZED", { error: "invalid_token" });
					}
					await enforceDpopBinding({
						payload: claims,
						authorization,
						proofJwt: ctx.body.dpop,
						method: ctx.body.method,
						url: ctx.body.url,
						replayStore: createDpopReplayStore(ctx.context.internalAdapter),
					});
					return {
						userId: claims.sub,
						clientId: claims.client_id,
						scopes: claims.scope.split(/\s+/).filter(Boolean),
					};
				},
			),
		},
	};
	return [provider, boundary] as const;
}
