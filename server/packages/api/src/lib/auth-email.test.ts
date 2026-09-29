import { afterEach, describe, expect, test } from "bun:test";

const names = [
	"AUTH_EMAIL_DELIVERY",
	"RESEND_API_KEY",
	"TRANSACTIONAL_EMAIL_ADDRESS",
] as const;
const original = Object.fromEntries(names.map((n) => [n, process.env[n]]));

function setEnv(values: Partial<Record<(typeof names)[number], string>>) {
	for (const name of names) {
		const value = values[name];
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
}

// Each case imports a fresh module so the cached delivery doesn't leak.
async function load() {
	return import(`./auth-email?case=${Math.random()}`);
}

afterEach(() => setEnv(original as Record<string, string>));

describe("requireAuthEmailDelivery", () => {
	test("requires an explicit choice", async () => {
		setEnv({});
		const { requireAuthEmailDelivery } = await load();
		expect(() => requireAuthEmailDelivery()).toThrow("AUTH_EMAIL_DELIVERY");
	});

	test("requires Resend settings when delivering by email", async () => {
		setEnv({ AUTH_EMAIL_DELIVERY: "resend", RESEND_API_KEY: "re_test" });
		const { requireAuthEmailDelivery } = await load();
		expect(() => requireAuthEmailDelivery()).toThrow(
			"TRANSACTIONAL_EMAIL_ADDRESS",
		);
	});

	test("logs codes when asked to", async () => {
		setEnv({ AUTH_EMAIL_DELIVERY: "log" });
		const { requireAuthEmailDelivery, sendAuthOTPEmail } = await load();
		expect(requireAuthEmailDelivery().kind).toBe("log");
		const logged: string[] = [];
		const info = console.info;
		console.info = (message: string) => logged.push(message);
		try {
			await sendAuthOTPEmail({
				email: "owner@example.com",
				otp: "123456",
				type: "sign-in",
			});
		} finally {
			console.info = info;
		}
		expect(logged).toEqual([
			"[auth] sign-in OTP for owner@example.com: 123456",
		]);
	});
});
