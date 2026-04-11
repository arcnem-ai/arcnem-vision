const DEFAULT_SLUG = "item";
const API_KEY_PREFIX = "arcnem";
const API_KEY_BYTES = 24;

export function requireDisplayName(value: string, field: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		throw new Error(`${field} is required.`);
	}
	if (trimmed.length > 80) {
		throw new Error(`${field} must be 80 characters or fewer.`);
	}
	return trimmed;
}

export function slugify(value: string): string {
	const normalized = value
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return normalized || DEFAULT_SLUG;
}

export function createUniqueSlug(
	baseValue: string,
	existingValues: Iterable<string>,
): string {
	const baseSlug = slugify(baseValue);
	const existing = new Set(existingValues);

	if (!existing.has(baseSlug)) {
		return baseSlug;
	}

	let counter = 2;
	while (existing.has(`${baseSlug}-${counter}`)) {
		counter += 1;
	}

	return `${baseSlug}-${counter}`;
}

export async function hashAPIKey(key: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(key),
	);

	return Buffer.from(digest).toString("base64url");
}

export function generatePlainAPIKey(): string {
	const randomBytes = crypto.getRandomValues(new Uint8Array(API_KEY_BYTES));
	return `${API_KEY_PREFIX}_${Buffer.from(randomBytes).toString("base64url")}`;
}

export function getAPIKeyPrefix(rawKey: string): string {
	const separatorIndex = rawKey.indexOf("_");
	return separatorIndex > 0 ? rawKey.slice(0, separatorIndex) : API_KEY_PREFIX;
}

export function getAPIKeyStart(rawKey: string): string {
	return rawKey.slice(0, 12);
}
