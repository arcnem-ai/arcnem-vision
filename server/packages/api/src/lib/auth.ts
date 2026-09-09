import { schema } from "@arcnem-vision/db";
import { getDB } from "@arcnem-vision/db/server";
import { getAuthFeatureFlags } from "@arcnem-vision/shared";
import { cimd } from "@better-auth/cimd";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, emailOTP, organization } from "better-auth/plugins";
import { getRedisClient } from "@/clients/redis";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { sendAuthOTPEmail } from "@/lib/auth-email";
import { getTrustedOrigins } from "@/lib/auth-origins";
import { incrementWithTTL } from "@/lib/auth-secondary-storage";
import { createMcpAuthPlugins } from "@/lib/mcp-auth-plugin";
import { fetchOAuthClientMetadata } from "@/lib/oauth-metadata-fetch";

export const mcpResourceUrl = new URL(
	"/api/mcp",
	getAPIEnvVar("BETTER_AUTH_BASE_URL"),
).href;

const db = getDB();
const redisClient = getRedisClient();
const authFeatureFlags = getAuthFeatureFlags();

export const auth = betterAuth({
	baseURL: getAPIEnvVar("BETTER_AUTH_BASE_URL"),
	experimental: { joins: true },
	verification: { storeInDatabase: true },
	session: {
		storeSessionInDatabase: true,
		cookieCache: {
			enabled: false,
		},
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (
				authFeatureFlags.signUpEnabled ||
				ctx.path !== "/email-otp/send-verification-otp"
			) {
				return ctx;
			}

			const email = ctx.body?.email;
			if (typeof email !== "string" || email.trim().length === 0) {
				throw new APIError("BAD_REQUEST", {
					message: "Email is required.",
				});
			}

			const normalizedEmail = email.trim().toLowerCase();
			const existingUser = await db.query.users.findFirst({
				where: (row, { eq }) => eq(row.email, normalizedEmail),
				columns: {
					id: true,
				},
			});

			if (!existingUser) {
				throw new APIError("BAD_REQUEST", {
					message: "Sign up is disabled for this environment.",
				});
			}

			return ctx;
		}),
	},
	trustedOrigins: getTrustedOrigins(),
	advanced: {
		database: {
			generateId: false,
		},
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema,
	}),
	secret: getAPIEnvVar("BETTER_AUTH_SECRET"),
	secondaryStorage: {
		get: async (key) => await redisClient.get(key),
		getAndDelete: async (key) => await redisClient.getdel(key),
		increment: async (key, ttl) => incrementWithTTL(redisClient, key, ttl),
		set: async (key, value, ttl) => {
			if (ttl) await redisClient.set(key, value, "EX", ttl);
			else await redisClient.set(key, value);
		},
		delete: async (key) => {
			await redisClient.del(key);
		},
	},
	plugins: [
		...createMcpAuthPlugins({
			resource: mcpResourceUrl,
			loginPage: new URL("/oauth/login", getAPIEnvVar("DASHBOARD_ORIGIN")).href,
			consentPage: new URL("/oauth/consent", getAPIEnvVar("DASHBOARD_ORIGIN"))
				.href,
		}),
		cimd({
			fetchClientMetadataResource: fetchOAuthClientMetadata,
			metadataProfile: "mcp-2026-07-28",
		}),
		emailOTP({
			disableSignUp: !authFeatureFlags.signUpEnabled,
			async sendVerificationOTP({ email, otp, type }) {
				await sendAuthOTPEmail({
					email,
					otp,
					type,
				});
			},
		}),
		organization({
			allowUserToCreateOrganization: async () =>
				authFeatureFlags.organizationCreationEnabled,
		}),
		admin(),
	],
});
