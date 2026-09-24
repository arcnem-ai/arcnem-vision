import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	randomBytes,
} from "node:crypto";
import { API_ENV_VAR } from "@/env/apiEnvVar";
import { getAPIEnvVar } from "@/env/getAPIEnvVar";

const SECRET_PREFIX = "whsec_";
const CIPHERTEXT_VERSION = "v1";

// Standard Webhooks secret: "whsec_" + base64 key bytes.
export function generateSigningSecret() {
	return `${SECRET_PREFIX}${randomBytes(32).toString("base64")}`;
}

function signingKeyBytes(secret: string) {
	if (!secret.startsWith(SECRET_PREFIX))
		throw new Error("Invalid webhook signing secret");
	return Buffer.from(secret.slice(SECRET_PREFIX.length), "base64");
}

// Standard Webhooks signature over "id.timestamp.body" with HMAC-SHA256.
export function signWebhook(
	secret: string,
	id: string,
	timestamp: number,
	body: string,
) {
	const mac = createHmac("sha256", signingKeyBytes(secret))
		.update(`${id}.${timestamp}.${body}`)
		.digest("base64");
	return `v1,${mac}`;
}

function encryptionKey(
	value = getAPIEnvVar(API_ENV_VAR.WEBHOOK_SECRET_ENCRYPTION_KEY),
) {
	const key = Buffer.from(value, "base64");
	if (key.byteLength !== 32)
		throw new Error(
			`${API_ENV_VAR.WEBHOOK_SECRET_ENCRYPTION_KEY} must be 32 bytes encoded as base64`,
		);
	return key;
}

// Called at API startup so a missing or malformed key stops the service
// instead of failing the first webhook request.
export function requireWebhookSecretEncryptionKey() {
	encryptionKey();
}

export function encryptSigningSecret(secret: string, keyValue?: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyValue), iv);
	const ciphertext = Buffer.concat([
		cipher.update(secret, "utf8"),
		cipher.final(),
	]);
	return [
		CIPHERTEXT_VERSION,
		iv.toString("base64"),
		cipher.getAuthTag().toString("base64"),
		ciphertext.toString("base64"),
	].join(":");
}

export function decryptSigningSecret(stored: string, keyValue?: string) {
	const [version, iv, tag, ciphertext] = stored.split(":");
	if (version !== CIPHERTEXT_VERSION || !iv || !tag || !ciphertext)
		throw new Error("Unsupported webhook secret ciphertext");
	const decipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(keyValue),
		Buffer.from(iv, "base64"),
	);
	decipher.setAuthTag(Buffer.from(tag, "base64"));
	return Buffer.concat([
		decipher.update(Buffer.from(ciphertext, "base64")),
		decipher.final(),
	]).toString("utf8");
}
