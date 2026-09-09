import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	type ServiceWorkflowExecutionAccepted,
	type ServiceWorkflowExecutionRequest,
	serviceWorkflowExecutionAcceptedSchema,
} from "@arcnem-vision/shared";
import {
	and,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	type SQL,
} from "drizzle-orm";
import type { Inngest } from "inngest";
import {
	buildExecutionScope,
	buildSeededInitialState,
	buildWorkflowExecutionEventData,
	buildWorkflowExecutionSnapshot,
	createServiceIdempotencyRequestHash,
	createWorkflowExecutionSnapshotHash,
	mergeRequestedDocumentIds,
} from "@/routes/service.helpers";

const { agentGraphRuns, documents } = schema;
const MAX_SCOPED_DOCUMENTS = 500;
const WORKFLOW_ENQUEUE_ERROR = "Failed to enqueue workflow execution";

export type ProjectScope = { organizationId: string; projectId: string };
export type ExecutionScope = ProjectScope &
	(
		| { apiKeyId: string; idempotencyActor?: never }
		| { apiKeyId?: never; idempotencyActor: string }
	);

function executionResult<
	T extends object,
	S extends 202 | 400 | 404 | 409 | 502,
>(body: T, status: S) {
	return { body, status };
}

async function findIdempotentWorkflowRun(
	dbClient: PGDB,
	scope: ExecutionScope,
	idempotencyKey: string,
) {
	const [run] = await dbClient
		.select({
			requestHash: agentGraphRuns.idempotencyRequestHash,
			response: agentGraphRuns.idempotencyResponse,
			status: agentGraphRuns.status,
		})
		.from(agentGraphRuns)
		.where(
			and(
				scope.apiKeyId !== undefined
					? eq(agentGraphRuns.apiKeyId, scope.apiKeyId)
					: eq(agentGraphRuns.idempotencyActor, scope.idempotencyActor),
				eq(agentGraphRuns.projectId, scope.projectId),
				eq(agentGraphRuns.idempotencyKey, idempotencyKey),
			),
		)
		.limit(1);
	return run;
}

export async function resolveScopedDocumentIds(
	dbClient: PGDB,
	scope: ProjectScope,
	input: {
		documentIds?: string[];
		scope?: {
			apiKeyIds?: string[];
			documentIds?: string[];
			apiKeyBound?: boolean;
		};
	},
) {
	const requestedDocumentIds = mergeRequestedDocumentIds(input);

	const conditions: SQL<unknown>[] = [
		eq(documents.organizationId, scope.organizationId),
		eq(documents.projectId, scope.projectId),
	];

	if (requestedDocumentIds.length > 0) {
		conditions.push(inArray(documents.id, requestedDocumentIds));
	}

	if ((input.scope?.apiKeyIds?.length ?? 0) > 0) {
		conditions.push(inArray(documents.apiKeyId, input.scope?.apiKeyIds ?? []));
	}

	if (input.scope?.apiKeyBound === true) {
		conditions.push(isNotNull(documents.apiKeyId));
	}

	if (input.scope?.apiKeyBound === false) {
		conditions.push(isNull(documents.apiKeyId));
	}

	const rows = await dbClient
		.select({ id: documents.id })
		.from(documents)
		.where(and(...conditions))
		.orderBy(desc(documents.createdAt), desc(documents.id))
		.limit(MAX_SCOPED_DOCUMENTS + 1);

	if (rows.length > MAX_SCOPED_DOCUMENTS) {
		return {
			ok: false as const,
			status: 400 as const,
			body: {
				message: `Scope matched more than ${MAX_SCOPED_DOCUMENTS} documents. Narrow the scope or execute in batches.`,
				maxDocumentCount: MAX_SCOPED_DOCUMENTS,
			},
		};
	}

	const matchedDocumentIds = rows.map((row) => row.id);
	if (requestedDocumentIds.length > 0) {
		const matchedDocumentIdSet = new Set(matchedDocumentIds);
		const missingDocumentIds = requestedDocumentIds.filter(
			(documentId) => !matchedDocumentIdSet.has(documentId),
		);
		if (missingDocumentIds.length > 0) {
			return {
				ok: false as const,
				status: 404 as const,
				body: {
					message:
						"One or more requested documents were not found in this project",
					missingDocumentIds,
				},
			};
		}
	}

	return {
		ok: true as const,
		documentIds: matchedDocumentIds,
	};
}

async function dispatchServiceWorkflowExecution(input: {
	inngestClient: Inngest;
	organizationId: string;
	projectId: string;
	request: ServiceWorkflowExecutionRequest;
	response: ServiceWorkflowExecutionAccepted;
	run: { status: string };
}) {
	const { inngestClient, projectId, request, response, run } = input;

	if (run.status !== "running") {
		return true;
	}

	const executionScope = buildExecutionScope(
		request.scope,
		response.documentIds,
	);
	const seededState = buildSeededInitialState(
		request.initialState,
		projectId,
		executionScope,
	);

	try {
		await inngestClient.send({
			// A stable event ID keeps concurrent retries from starting another run.
			id: response.executionId,
			name: "workflow/execute",
			data: buildWorkflowExecutionEventData(
				response.executionId,
				response.workflowId,
				input.organizationId,
				response.documentIds,
				executionScope,
				seededState,
			),
		});
		return true;
	} catch {
		// Delivery can be ambiguous. Keep the run resumable; retries reuse the stable event ID.
		return false;
	}
}

export async function executeServiceWorkflow(
	dbClient: PGDB,
	inngestClient: Inngest,
	scope: ExecutionScope,
	body: ServiceWorkflowExecutionRequest,
) {
	const { idempotencyKey, ...requestInput } = body;
	const requestHash = createServiceIdempotencyRequestHash(requestInput);

	const replayExecution = async (run: {
		requestHash: string | null;
		response: unknown;
		status: string;
	}) => {
		if (run.requestHash !== requestHash) {
			return executionResult(
				{ message: "Idempotency key was already used with different input" },
				409,
			);
		}

		const replay = serviceWorkflowExecutionAcceptedSchema.safeParse(
			run.response,
		);
		if (!replay.success) {
			throw new Error("Stored workflow execution response is invalid");
		}

		const enqueued = await dispatchServiceWorkflowExecution({
			inngestClient,
			organizationId: scope.organizationId,
			projectId: scope.projectId,
			request: body,
			response: replay.data,
			run,
		});
		return enqueued
			? executionResult(replay.data, 202)
			: executionResult({ message: WORKFLOW_ENQUEUE_ERROR }, 502);
	};

	if (idempotencyKey) {
		const existingRun = await findIdempotentWorkflowRun(
			dbClient,
			scope,
			idempotencyKey,
		);
		if (existingRun) {
			return replayExecution(existingRun);
		}
	}

	const workflow = await dbClient.query.agentGraphs.findFirst({
		where: (row, { and, eq, isNull }) =>
			and(
				eq(row.id, body.workflowId),
				eq(row.organizationId, scope.organizationId),
				isNull(row.archivedAt),
			),
		columns: {
			id: true,
			name: true,
			description: true,
			entryNode: true,
			stateSchema: true,
			agentGraphTemplateId: true,
			agentGraphTemplateVersionId: true,
			organizationId: true,
		},
		with: {
			agentGraphNodes: {
				columns: {
					id: true,
					nodeKey: true,
					nodeType: true,
					inputKey: true,
					outputKey: true,
					config: true,
					agentGraphId: true,
					modelId: true,
				},
				with: {
					models: {
						columns: {
							id: true,
							provider: true,
							name: true,
							type: true,
							embeddingDim: true,
							version: true,
							inputSchema: true,
							outputSchema: true,
							config: true,
						},
					},
					agentGraphNodeTools: {
						columns: {},
						with: {
							tools: {
								columns: {
									id: true,
									name: true,
									description: true,
									inputSchema: true,
									outputSchema: true,
								},
							},
						},
					},
				},
			},
			agentGraphEdges: {
				columns: {
					id: true,
					fromNode: true,
					toNode: true,
					agentGraphId: true,
				},
			},
		},
	});
	if (!workflow) {
		return executionResult({ message: "Workflow not found" }, 404);
	}
	const graphSnapshot = buildWorkflowExecutionSnapshot(workflow);
	const graphSnapshotHash = createWorkflowExecutionSnapshotHash(graphSnapshot);

	const scopedDocumentResolution = await resolveScopedDocumentIds(
		dbClient,
		scope,
		body,
	);
	if (!scopedDocumentResolution.ok) {
		return executionResult(
			scopedDocumentResolution.body,
			scopedDocumentResolution.status,
		);
	}

	if (scopedDocumentResolution.documentIds.length === 0) {
		return executionResult(
			{ message: "No accessible documents matched the request" },
			400,
		);
	}

	const executionId = Bun.randomUUIDv7();
	const executionScope = buildExecutionScope(
		body.scope,
		scopedDocumentResolution.documentIds,
	);
	const seededState = buildSeededInitialState(
		body.initialState,
		scope.projectId,
		executionScope,
	);
	const response = {
		executionId,
		workflowId: workflow.id,
		status: "running" as const,
		documentIds: scopedDocumentResolution.documentIds,
		documentCount: scopedDocumentResolution.documentIds.length,
	};

	const [created] = await dbClient
		.insert(agentGraphRuns)
		.values({
			id: executionId,
			agentGraphId: workflow.id,
			projectId: scope.projectId,
			status: "running",
			graphSnapshot,
			graphSnapshotHash,
			initialState: seededState,
			apiKeyId: idempotencyKey ? (scope.apiKeyId ?? null) : null,
			idempotencyActor: idempotencyKey
				? (scope.idempotencyActor ?? null)
				: null,
			idempotencyKey: idempotencyKey ?? null,
			idempotencyRequestHash: idempotencyKey ? requestHash : null,
			idempotencyResponse: idempotencyKey ? response : null,
		})
		.onConflictDoNothing()
		.returning({ id: agentGraphRuns.id });

	if (!created) {
		if (!idempotencyKey) {
			throw new Error("Failed to create workflow execution");
		}
		const racedRun = await findIdempotentWorkflowRun(
			dbClient,
			scope,
			idempotencyKey,
		);
		if (!racedRun) {
			throw new Error("Workflow idempotency conflict is missing its run");
		}
		return replayExecution(racedRun);
	}

	const enqueued = await dispatchServiceWorkflowExecution({
		inngestClient,
		organizationId: scope.organizationId,
		projectId: scope.projectId,
		request: body,
		response,
		run: { status: "running" },
	});
	return enqueued
		? executionResult(response, 202)
		: executionResult({ message: WORKFLOW_ENQUEUE_ERROR }, 502);
}
