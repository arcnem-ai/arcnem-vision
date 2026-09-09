import { describe, expect, test } from "bun:test";
import { cimd } from "@better-auth/cimd";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { deriveDpopAth, deriveDpopJkt } from "better-auth/oauth2";
import { admin, emailOTP } from "better-auth/plugins";
import { createMcpAuthPlugins, MCP_SCOPES } from "./mcp-auth-plugin";
import { pinnedMetadataDestination } from "./oauth-metadata-fetch";

const origin = "http://localhost:3000";
const resource = `${origin}/api/mcp`;
const clientId = "https://agent.example/client.json";
const redirectUri = "http://127.0.0.1:4545/callback";

function setup() {
	const data: Record<string, Record<string, unknown>[]> = {};
	let otp = "";
	const plugins = createMcpAuthPlugins({
		resource,
		loginPage: "/oauth/login",
		consentPage: "/oauth/consent",
	});
	for (const name of [
		"user",
		"session",
		"account",
		"verification",
		...Object.keys(plugins[0].schema),
	])
		data[name] = [];
	const auth = betterAuth({
		baseURL: origin,
		secret: "test-secret-at-least-thirty-two-characters",
		database: (options: BetterAuthOptions) => {
			const adapter = memoryAdapter(data)(options);
			return {
				...adapter,
				async create(input: Parameters<typeof adapter.create>[0]) {
					// Match the primary-key constraint provided by production Postgres.
					if (
						input.data.id &&
						data[input.model]?.some((row) => row.id === input.data.id)
					)
						throw new Error("duplicate primary key");
					return adapter.create(input);
				},
			};
		},
		emailAndPassword: { enabled: true },
		plugins: [
			...plugins,
			admin(),
			emailOTP({
				async sendVerificationOTP(input) {
					otp = input.otp;
				},
			}),
			cimd({
				metadataProfile: "mcp-2026-07-28",
				fetchClientMetadataResource: async () =>
					Response.json({
						client_id: clientId,
						client_name: "Experiment agent",
						redirect_uris: [redirectUri],
						token_endpoint_auth_method: "none",
						grant_types: ["authorization_code", "refresh_token"],
						scope: [...MCP_SCOPES, "offline_access"].join(" "),
					}),
			}),
		],
	});
	return { auth, data, getOtp: () => otp };
}

async function form(
	auth: ReturnType<typeof setup>["auth"],
	path: string,
	body: Record<string, string>,
) {
	return auth.handler(
		new Request(`${origin}/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams(body),
		}),
	);
}

describe("MCP OAuth boundary", () => {
	test("PKCE, consent, scoped resource tokens, rotation and revocation", async () => {
		const { auth, data } = setup();
		const signup = await auth.api.signUpEmail({
			body: {
				email: "member@example.com",
				password: "long-enough-test-password",
				name: "Member",
			},
			asResponse: true,
		});
		expect(signup.status).toBe(200);
		const cookie = signup.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		const verifier = "test-verifier-with-at-least-43-characters-for-pkce-s256";
		const challenge = Buffer.from(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
		).toString("base64url");
		const authorize = new URL(`${origin}/api/auth/oauth2/authorize`);
		authorize.search = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope:
				"projects:read workflows:read workflows:write workflows:execute documents:list documents:search documents:read offline_access",
			resource,
			state: "test-state",
			code_challenge: challenge,
			code_challenge_method: "S256",
		}).toString();
		const noPkce = new URL(authorize);
		noPkce.searchParams.delete("code_challenge");
		noPkce.searchParams.delete("code_challenge_method");
		const rejected = await auth.handler(
			new Request(noPkce, { headers: { cookie } }),
		);
		expect(
			rejected.status === 400 ||
				(rejected.headers.get("location") ?? "").includes("error="),
		).toBe(true);
		const response = await auth.handler(
			new Request(authorize, { headers: { cookie } }),
		);
		expect(response.status).toBe(302);
		const consent = new URL(response.headers.get("location") ?? "", origin);
		expect(consent.pathname).toBe("/oauth/consent");
		const publicClient = await auth.api.getOAuthClientPublic({
			query: { client_id: clientId },
			headers: { cookie },
		});
		expect(publicClient.client_name).toBe("Experiment agent");
		const tampered = new URLSearchParams(consent.search);
		tampered.set("scope", "admin");
		const altered = await auth.handler(
			new Request(`${origin}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: { cookie, origin, "content-type": "application/json" },
				body: JSON.stringify({
					accept: true,
					oauth_query: tampered.toString(),
				}),
			}),
		);
		expect(altered.status).toBeGreaterThanOrEqual(400);
		const accept = await auth.handler(
			new Request(`${origin}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: { cookie, origin, "content-type": "application/json" },
				body: JSON.stringify({
					accept: true,
					oauth_query: consent.search.slice(1),
				}),
			}),
		);
		expect(accept.status).toBe(200);
		const accepted = (await accept.json()) as {
			url?: string;
			redirect_uri?: string;
		};
		const callback = new URL(accepted.url ?? accepted.redirect_uri ?? "");
		expect(callback.searchParams.get("state")).toBe("test-state");
		expect(callback.searchParams.get("iss")).toBe(`${origin}/api/auth`);
		const code = callback.searchParams.get("code") ?? "";
		const tokenResponse = await form(auth, "/oauth2/token", {
			grant_type: "authorization_code",
			client_id: clientId,
			code,
			redirect_uri: redirectUri,
			code_verifier: verifier,
			resource,
		});
		expect(tokenResponse.status).toBe(200);
		const tokens = (await tokenResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};
		const request = (token: string) =>
			auth.api.verifyMcpRequest({
				body: {
					authorization: `Bearer ${token}`,
					dpop: null,
					method: "POST",
					url: resource,
				},
			});
		expect(await request(tokens.access_token)).toMatchObject({
			clientId,
			scopes: expect.arrayContaining(["workflows:write", "documents:read"]),
		});
		expect(JSON.stringify(data)).not.toContain(tokens.access_token);
		data.user[0].banned = true;
		await expect(request(tokens.access_token)).rejects.toBeDefined();
		data.user[0].banExpires = new Date(Date.now() - 1000);
		expect((await request(tokens.access_token)).clientId).toBe(clientId);
		data.user[0].banned = false;
		data.user[0].banExpires = null;
		await expect(request("not-a-token")).rejects.toBeDefined();
		await expect(
			auth.api.verifyMcpRequest({
				body: {
					authorization: `Basic ${tokens.access_token}`,
					dpop: null,
					method: "POST",
					url: resource,
				},
			}),
		).rejects.toBeDefined();
		// A resource or expiry change is rejected independently of the opaque lookup.
		const stored = data.oauthAccessToken.find((row) => row.revoked == null);
		if (!stored) throw new Error("Missing access token row");
		const previousResources = stored.resources;
		stored.resources = ["https://other.example/mcp"];
		await expect(request(tokens.access_token)).rejects.toBeDefined();
		stored.resources = previousResources;
		const session = data.session.find((row) => row.id === stored.sessionId);
		if (!session) throw new Error("Missing authorization session");
		const sessionExpiry = session.expiresAt;
		session.expiresAt = new Date(0);
		await expect(request(tokens.access_token)).rejects.toBeDefined();
		session.expiresAt = sessionExpiry;
		data.oauthClient[0].disabled = true;
		await expect(request(tokens.access_token)).rejects.toBeDefined();
		data.oauthClient[0].disabled = false;
		const keys = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);
		const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
		stored.confirmation = { jkt: await deriveDpopJkt(jwk) };
		await expect(request(tokens.access_token)).rejects.toBeDefined();
		const encode = (value: unknown) =>
			Buffer.from(JSON.stringify(value)).toString("base64url");
		const proofData = `${encode({ typ: "dpop+jwt", alg: "ES256", jwk })}.${encode({ jti: crypto.randomUUID(), htm: "POST", htu: resource, iat: Math.floor(Date.now() / 1000), ath: await deriveDpopAth(tokens.access_token) })}`;
		const signature = await crypto.subtle.sign(
			{ name: "ECDSA", hash: "SHA-256" },
			keys.privateKey,
			new TextEncoder().encode(proofData),
		);
		const proof = `${proofData}.${Buffer.from(signature).toString("base64url")}`;
		const boundRequest = () =>
			auth.api.verifyMcpRequest({
				body: {
					authorization: `DPoP ${tokens.access_token}`,
					dpop: proof,
					method: "POST",
					url: resource,
				},
			});
		expect((await boundRequest()).clientId).toBe(clientId);
		await expect(boundRequest()).rejects.toBeDefined();
		stored.confirmation = null;
		const expiry = stored.expiresAt;
		stored.expiresAt = new Date(0);
		await expect(request(tokens.access_token)).rejects.toBeDefined();
		stored.expiresAt = expiry;
		const refreshed = await form(auth, "/oauth2/token", {
			grant_type: "refresh_token",
			client_id: clientId,
			refresh_token: tokens.refresh_token,
			resource,
		});
		expect(refreshed.status).toBe(200);
		const rotated = (await refreshed.json()) as {
			access_token: string;
			refresh_token: string;
		};
		expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
		expect((await request(rotated.access_token)).clientId).toBe(clientId);
		const revoke = await form(auth, "/oauth2/revoke", {
			client_id: clientId,
			token: rotated.access_token,
			token_type_hint: "access_token",
		});
		expect(revoke.status).toBe(200);
		await expect(request(rotated.access_token)).rejects.toBeDefined();
		const reuse = await form(auth, "/oauth2/token", {
			grant_type: "refresh_token",
			client_id: clientId,
			refresh_token: tokens.refresh_token,
			resource,
		});
		expect(reuse.status).toBeGreaterThanOrEqual(400);
		const replay = await form(auth, "/oauth2/token", {
			grant_type: "authorization_code",
			client_id: clientId,
			code,
			redirect_uri: redirectUri,
			code_verifier: verifier,
			resource,
		});
		expect(replay.status).toBeGreaterThanOrEqual(400);
	});

	test("email OTP continues the signed login flow and refresh revocation stops access", async () => {
		const { auth, getOtp } = setup();
		const verifier = "test-verifier-with-at-least-43-characters-for-pkce-s256";
		const challenge = Buffer.from(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
		).toString("base64url");
		const query = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: "projects:read offline_access",
			resource,
			code_challenge: challenge,
			code_challenge_method: "S256",
		});
		const start = await auth.handler(
			new Request(`${origin}/api/auth/oauth2/authorize?${query}`),
		);
		const login = new URL(start.headers.get("location") ?? "", origin);
		expect(login.pathname).toBe("/oauth/login");
		await auth.api.sendVerificationOTP({
			body: { email: "otp@example.com", type: "sign-in" },
		});
		const signedIn = await auth.handler(
			new Request(`${origin}/api/auth/sign-in/email-otp`, {
				method: "POST",
				headers: { origin, "content-type": "application/json" },
				body: JSON.stringify({
					email: "otp@example.com",
					otp: getOtp(),
					oauth_query: login.search.slice(1),
				}),
			}),
		);
		expect(signedIn.status).toBe(200);
		const cookie = signedIn.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		const signedInData = (await signedIn.json()) as { url: string };
		const consent = new URL(signedInData.url, origin);
		expect(consent.pathname).toBe("/oauth/consent");
		const consentResponse = await auth.handler(
			new Request(`${origin}/api/auth/oauth2/consent`, {
				method: "POST",
				headers: { cookie, origin, "content-type": "application/json" },
				body: JSON.stringify({
					accept: true,
					oauth_query: consent.search.slice(1),
				}),
			}),
		);
		expect(consentResponse.status).toBe(200);
		const response = (await consentResponse.json()) as { url: string };
		const callback = new URL(response.url);
		const tokensResponse = await form(auth, "/oauth2/token", {
			grant_type: "authorization_code",
			client_id: clientId,
			code: callback.searchParams.get("code") ?? "",
			redirect_uri: redirectUri,
			code_verifier: verifier,
			resource,
		});
		expect(tokensResponse.status).toBe(200);
		const tokens = (await tokensResponse.json()) as {
			access_token: string;
			refresh_token: string;
		};
		const request = () =>
			auth.api.verifyMcpRequest({
				body: {
					authorization: `Bearer ${tokens.access_token}`,
					dpop: null,
					method: "POST",
					url: resource,
				},
			});
		expect((await request()).scopes).toEqual([
			"projects:read",
			"offline_access",
		]);
		const revoke = await form(auth, "/oauth2/revoke", {
			client_id: clientId,
			token: tokens.refresh_token,
			token_type_hint: "refresh_token",
		});
		expect(revoke.status).toBe(200);
		await expect(request()).rejects.toBeDefined();
		const refreshed = await form(auth, "/oauth2/token", {
			grant_type: "refresh_token",
			client_id: clientId,
			refresh_token: tokens.refresh_token,
			resource,
		});
		expect(refreshed.status).toBeGreaterThanOrEqual(400);
	});

	test("metadata connections pin a public address and reject private or mixed DNS answers", () => {
		expect(
			pinnedMetadataDestination(new URL(clientId), [
				{ address: "93.184.216.34", family: 4 },
			]),
		).toEqual({
			hostname: "93.184.216.34",
			servername: "agent.example",
			port: 443,
			path: "/client.json",
		});
		for (const address of [
			"127.0.0.1",
			"::1",
			"169.254.169.254",
			"10.0.0.1",
			"100.64.0.1",
			"192.168.1.2",
			"fc00::1",
			"0.0.0.0",
		]) {
			expect(() =>
				pinnedMetadataDestination(new URL(clientId), [
					{ address: "93.184.216.34", family: 4 },
					{ address, family: address.includes(":") ? 6 : 4 },
				]),
			).toThrow();
		}
		expect(() =>
			pinnedMetadataDestination(new URL("http://agent.example/client"), [
				{ address: "93.184.216.34", family: 4 },
			]),
		).toThrow();
	});
});
