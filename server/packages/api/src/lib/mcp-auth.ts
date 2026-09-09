import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { isInsufficientScopeError } from "better-auth/oauth2";
import { auth, mcpResourceUrl } from "@/lib/auth";
import { MCP_SCOPES, type McpPrincipal } from "@/lib/mcp-auth-plugin";

export type { McpPrincipal } from "@/lib/mcp-auth-plugin";
export { MCP_SCOPES } from "@/lib/mcp-auth-plugin";

export async function protectMcpRequest(
	request: Request,
	handler: (principal: McpPrincipal) => Promise<Response>,
) {
	let principal: McpPrincipal;
	try {
		principal = await auth.api.verifyMcpRequest({
			body: {
				authorization: request.headers.get("authorization") ?? "",
				dpop: request.headers.get("dpop"),
				method: request.method,
				// The configured public resource is authoritative behind reverse proxies.
				url: mcpResourceUrl,
			},
		});
	} catch (error) {
		return challenge(error);
	}
	try {
		return await handler(principal);
	} catch (error) {
		if (isInsufficientScopeError(error)) return challenge(error);
		throw error;
	}
}

function challenge(error: unknown) {
	const result = createResourceServerChallenge(error, mcpResourceUrl, {
		challengeScopes: MCP_SCOPES,
	});
	if (!result) {
		if (!(error instanceof APIError)) throw error;
		if (error.statusCode >= 500) throw error;
		return challenge(new APIError("UNAUTHORIZED", { error: "invalid_token" }));
	}
	return Response.json(
		{
			jsonrpc: "2.0",
			error: { code: -32000, message: result.message },
			id: null,
		},
		{ status: result.statusCode, headers: result.headers },
	);
}
