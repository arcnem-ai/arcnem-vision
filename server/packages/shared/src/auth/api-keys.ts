export type APIKeyKind = "workflow" | "service";

export type APIKeyPermissionDomain = "uploads" | "documents" | "workflows";

export type APIKeyPermissions = Partial<
	Record<APIKeyPermissionDomain, string[]>
>;

const API_KEY_PERMISSION_DOMAINS: APIKeyPermissionDomain[] = [
	"uploads",
	"documents",
	"workflows",
];

export const DEFAULT_WORKFLOW_API_KEY_PERMISSIONS: APIKeyPermissions = {
	uploads: ["presign", "ack"],
	documents: ["list", "read", "similar"],
};

export const DEFAULT_SERVICE_API_KEY_PERMISSIONS: APIKeyPermissions = {
	uploads: ["presign", "ack"],
	documents: ["list", "read", "visibility"],
	workflows: ["execute", "read"],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(
		value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			(Object.getPrototypeOf(value) === Object.prototype ||
				Object.getPrototypeOf(value) === null),
	);
}

function parsePermissionRecord(value: string | null) {
	if (!value) {
		return null;
	}

	try {
		const parsed = JSON.parse(value);
		return isPlainObject(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function getDefaultAPIKeyPermissions(
	kind: APIKeyKind,
): APIKeyPermissions {
	return kind === "service"
		? DEFAULT_SERVICE_API_KEY_PERMISSIONS
		: DEFAULT_WORKFLOW_API_KEY_PERMISSIONS;
}

export function resolveAPIKeyPermissions(
	value: string | null,
	kind: APIKeyKind,
): APIKeyPermissions {
	const parsed = parsePermissionRecord(value);
	const defaults = getDefaultAPIKeyPermissions(kind);
	const permissions: APIKeyPermissions = {};

	for (const domain of API_KEY_PERMISSION_DOMAINS) {
		const rawDomainValue = parsed?.[domain];
		if (Array.isArray(rawDomainValue)) {
			permissions[domain] = rawDomainValue.filter(
				(action): action is string =>
					typeof action === "string" && action.trim().length > 0,
			);
			continue;
		}

		if (defaults[domain]) {
			permissions[domain] = [...defaults[domain]];
		}
	}

	return permissions;
}
