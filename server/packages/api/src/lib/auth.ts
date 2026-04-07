import { schema } from "@arcnem-vision/db";
import { getDB } from "@arcnem-vision/db/server";
import { getAuthFeatureFlags } from "@arcnem-vision/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, apiKey, emailOTP, organization } from "better-auth/plugins";
import { getRedisClient } from "@/clients/redis";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";
import { sendAuthOTPEmail } from "@/lib/auth-email";
import { getTrustedOrigins } from "@/lib/auth-origins";

const db = getDB();
const redisClient = getRedisClient();
const authFeatureFlags = getAuthFeatureFlags();

export const auth = betterAuth({
	baseURL: getAPIEnvVar("BETTER_AUTH_BASE_URL"),
	experimental: { joins: true },
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
		set: async (key, value, ttl) => {
			if (ttl) await redisClient.set(key, value, "EX", ttl);
			else await redisClient.set(key, value);
		},
		delete: async (key) => {
			await redisClient.del(key);
		},
	},
	plugins: [
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
		apiKey({ storage: "secondary-storage", fallbackToDatabase: true }),
		organization({
			allowUserToCreateOrganization: async () =>
				authFeatureFlags.organizationCreationEnabled,
		}),
		admin(),
	],
});
