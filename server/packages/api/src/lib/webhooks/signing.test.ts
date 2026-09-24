import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
	decryptSigningSecret,
	encryptSigningSecret,
	generateSigningSecret,
	requireWebhookSecretEncryptionKey,
	signWebhook,
} from "./signing";

describe("webhook signing", () => {
	test("matches the Standard Webhooks reference vector", () => {
		expect(
			signWebhook(
				"whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
				"msg_p5jXN8AQM9LWM0D4loKWxJek",
				1614265330,
				'{"test": 2432232314}',
			),
		).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
	});

	test("signs exact bytes", () => {
		const secret = generateSigningSecret();
		const signature = signWebhook(secret, "evt_1", 1790244903, '{"a":1,"b":2}');
		expect(signWebhook(secret, "evt_1", 1790244903, '{"b":2,"a":1}')).not.toBe(
			signature,
		);
		expect(signWebhook(secret, "evt_1", 1790244904, '{"a":1,"b":2}')).not.toBe(
			signature,
		);
	});

	test("encrypts secrets at rest and rejects the wrong key", () => {
		const key = randomBytes(32).toString("base64");
		const secret = generateSigningSecret();
		const stored = encryptSigningSecret(secret, key);
		expect(stored).not.toContain(secret.slice(6));
		expect(decryptSigningSecret(stored, key)).toBe(secret);
		expect(() =>
			decryptSigningSecret(stored, randomBytes(32).toString("base64")),
		).toThrow();
		expect(() => encryptSigningSecret(secret, "c2hvcnQ=")).toThrow(
			"must be 32 bytes",
		);
	});
});

describe("webhook secret encryption key", () => {
	test("is required and must be 32 bytes", () => {
		const previous = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
		try {
			delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
			expect(() => requireWebhookSecretEncryptionKey()).toThrow(
				"WEBHOOK_SECRET_ENCRYPTION_KEY",
			);
			process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = "c2hvcnQ=";
			expect(() => requireWebhookSecretEncryptionKey()).toThrow(
				"must be 32 bytes",
			);
			process.env.WEBHOOK_SECRET_ENCRYPTION_KEY =
				randomBytes(32).toString("base64");
			expect(() => requireWebhookSecretEncryptionKey()).not.toThrow();
		} finally {
			if (previous === undefined)
				delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
			else process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = previous;
		}
	});
});
