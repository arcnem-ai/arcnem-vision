export const DASHBOARD_REALTIME_EVENT_VERSION = 1 as const;

export const DASHBOARD_REALTIME_SCOPE = {
	documents: "documents",
	runs: "runs",
} as const;

export type DashboardRealtimeScope =
	(typeof DASHBOARD_REALTIME_SCOPE)[keyof typeof DASHBOARD_REALTIME_SCOPE];

export const DASHBOARD_REALTIME_REASON = {
	documentCreated: "document-created",
	descriptionUpserted: "description-upserted",
	segmentationCreated: "segmentation-created",
	runCreated: "run-created",
	runStepChanged: "run-step-changed",
	runFinished: "run-finished",
} as const;

export type DashboardRealtimeReason =
	(typeof DASHBOARD_REALTIME_REASON)[keyof typeof DASHBOARD_REALTIME_REASON];

const DASHBOARD_REALTIME_REASON_SCOPE: Record<
	DashboardRealtimeReason,
	DashboardRealtimeScope
> = {
	[DASHBOARD_REALTIME_REASON.documentCreated]:
		DASHBOARD_REALTIME_SCOPE.documents,
	[DASHBOARD_REALTIME_REASON.descriptionUpserted]:
		DASHBOARD_REALTIME_SCOPE.documents,
	[DASHBOARD_REALTIME_REASON.segmentationCreated]:
		DASHBOARD_REALTIME_SCOPE.documents,
	[DASHBOARD_REALTIME_REASON.runCreated]: DASHBOARD_REALTIME_SCOPE.runs,
	[DASHBOARD_REALTIME_REASON.runStepChanged]: DASHBOARD_REALTIME_SCOPE.runs,
	[DASHBOARD_REALTIME_REASON.runFinished]: DASHBOARD_REALTIME_SCOPE.runs,
};

export type DashboardRealtimeEvent = {
	version: typeof DASHBOARD_REALTIME_EVENT_VERSION;
	scope: DashboardRealtimeScope;
	reason: DashboardRealtimeReason;
	organizationId: string;
	occurredAt: string;
	documentId?: string;
	sourceDocumentId?: string;
	segmentedDocumentId?: string;
	runId?: string;
};

export type DashboardRealtimeEventInput = Omit<
	DashboardRealtimeEvent,
	"version" | "scope" | "occurredAt"
> & {
	occurredAt?: string;
	scope?: DashboardRealtimeScope;
};

export function getDashboardRealtimeScopeForReason(
	reason: DashboardRealtimeReason,
): DashboardRealtimeScope {
	return DASHBOARD_REALTIME_REASON_SCOPE[reason];
}

export function getDashboardRealtimeChannel(organizationId: string): string {
	return `dashboard:org:${organizationId}:events`;
}

export function createDashboardRealtimeEvent(
	input: DashboardRealtimeEventInput,
): DashboardRealtimeEvent {
	const scope = input.scope ?? getDashboardRealtimeScopeForReason(input.reason);

	if (scope !== getDashboardRealtimeScopeForReason(input.reason)) {
		throw new Error(
			`Realtime scope ${scope} does not match reason ${input.reason}`,
		);
	}

	return {
		version: DASHBOARD_REALTIME_EVENT_VERSION,
		scope,
		reason: input.reason,
		organizationId: input.organizationId,
		occurredAt: input.occurredAt ?? new Date().toISOString(),
		documentId: input.documentId,
		sourceDocumentId: input.sourceDocumentId,
		segmentedDocumentId: input.segmentedDocumentId,
		runId: input.runId,
	};
}

export function serializeDashboardRealtimeEvent(
	input: DashboardRealtimeEvent | DashboardRealtimeEventInput,
): string {
	return JSON.stringify(
		"version" in input ? input : createDashboardRealtimeEvent(input),
	);
}

export function parseDashboardRealtimeEvent(
	value: string,
): DashboardRealtimeEvent | null {
	let parsed: unknown;

	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== "object") {
		return null;
	}

	const candidate = parsed as Record<string, unknown>;
	const reason =
		typeof candidate.reason === "string" ? candidate.reason : undefined;
	const scope =
		typeof candidate.scope === "string" ? candidate.scope : undefined;

	if (
		candidate.version !== DASHBOARD_REALTIME_EVENT_VERSION ||
		typeof candidate.organizationId !== "string" ||
		typeof candidate.occurredAt !== "string" ||
		!reason ||
		!isDashboardRealtimeReason(reason) ||
		!scope ||
		!isDashboardRealtimeScope(scope) ||
		scope !== getDashboardRealtimeScopeForReason(reason)
	) {
		return null;
	}

	return {
		version: DASHBOARD_REALTIME_EVENT_VERSION,
		scope,
		reason,
		organizationId: candidate.organizationId,
		occurredAt: candidate.occurredAt,
		documentId: readOptionalString(candidate.documentId),
		sourceDocumentId: readOptionalString(candidate.sourceDocumentId),
		segmentedDocumentId: readOptionalString(candidate.segmentedDocumentId),
		runId: readOptionalString(candidate.runId),
	};
}

function isDashboardRealtimeReason(
	value: string,
): value is DashboardRealtimeReason {
	return Object.values(DASHBOARD_REALTIME_REASON).includes(
		value as DashboardRealtimeReason,
	);
}

function isDashboardRealtimeScope(
	value: string,
): value is DashboardRealtimeScope {
	return Object.values(DASHBOARD_REALTIME_SCOPE).includes(
		value as DashboardRealtimeScope,
	);
}

function readOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
