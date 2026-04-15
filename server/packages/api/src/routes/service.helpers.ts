import {
	type ServiceDocumentListQuery,
	type ServiceDocumentScope,
	serviceDocumentListQuerySchema,
} from "@arcnem-vision/shared";

type ScopedDocumentSelection = {
	documentIds?: string[];
	scope?: ServiceDocumentScope;
};

export function parseCSVList(value: string | undefined) {
	if (!value) {
		return undefined;
	}

	const items = value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);

	return items.length > 0 ? items : undefined;
}

export function parseBoolean(value: string | undefined) {
	if (value === undefined) {
		return undefined;
	}

	if (value === "true" || value === "1") {
		return true;
	}

	if (value === "false" || value === "0") {
		return false;
	}

	return undefined;
}

export function parseServiceDocumentListQuery(input: {
	limit?: string;
	cursor?: string;
	documentIds?: string;
	deviceIds?: string;
	deviceBound?: string;
}) {
	const trimmedLimit = input.limit?.trim();
	const hasLimit = Boolean(trimmedLimit && trimmedLimit.length > 0);
	const rawLimit = hasLimit
		? Number.parseInt(trimmedLimit ?? "", 10)
		: undefined;
	const parsedDeviceBound = parseBoolean(input.deviceBound);
	if (input.deviceBound !== undefined && parsedDeviceBound === undefined) {
		return {
			ok: false as const,
			message: "deviceBound must be true or false",
		};
	}

	const parsed = serviceDocumentListQuerySchema.safeParse({
		limit: hasLimit ? rawLimit : undefined,
		cursor: input.cursor?.trim() || undefined,
		documentIds: parseCSVList(input.documentIds),
		deviceIds: parseCSVList(input.deviceIds),
		deviceBound: parsedDeviceBound,
	});

	if (!parsed.success) {
		return {
			ok: false as const,
			message: parsed.error.issues[0]?.message ?? "Invalid document filters",
		};
	}

	return {
		ok: true as const,
		data: parsed.data satisfies ServiceDocumentListQuery,
	};
}

export function mergeRequestedDocumentIds(input: ScopedDocumentSelection) {
	return Array.from(
		new Set([
			...(input.documentIds ?? []),
			...(input.scope?.documentIds ?? []),
		]),
	);
}

export function buildExecutionScope(
	scope: ServiceDocumentScope | undefined,
	documentIds: string[],
): ServiceDocumentScope & { documentIds: string[] } {
	return {
		...(scope ?? {}),
		documentIds,
	};
}

export function buildSeededInitialState<T extends Record<string, unknown>>(
	initialState: T | undefined,
	projectId: string,
	executionScope: ReturnType<typeof buildExecutionScope>,
): T & {
	project_id: string;
	scope: ReturnType<typeof buildExecutionScope>;
} {
	return {
		...(initialState ?? ({} as T)),
		project_id: projectId,
		scope: executionScope,
	};
}

export function buildWorkflowExecutionEventData<
	T extends Record<string, unknown>,
>(
	executionId: string,
	workflowId: string,
	documentIds: string[],
	executionScope: ReturnType<typeof buildExecutionScope>,
	initialState: T,
) {
	return {
		execution_id: executionId,
		workflow_id: workflowId,
		document_ids: documentIds,
		scope: executionScope,
		initial_state: initialState,
	};
}
