import { schema } from "@arcnem-vision/db";
import {
	serviceDocumentItemSchema,
	serviceDocumentSelectionErrorSchema,
	serviceDocumentsResponseSchema,
	serviceDocumentVisibilityUpdateSchema,
	serviceErrorResponseSchema,
	serviceUploadAcknowledgeRequestSchema,
	serviceUploadAcknowledgeResponseSchema,
	serviceUploadPresignRequestSchema,
	serviceUploadPresignResponseSchema,
	serviceWorkflowExecutionAcceptedSchema,
	serviceWorkflowExecutionItemSchema,
	serviceWorkflowExecutionRequestSchema,
	serviceWorkflowsResponseSchema,
} from "@arcnem-vision/shared";
import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	type SQL,
} from "drizzle-orm";
import { Hono, type Context as HonoContext } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { toAPIDocumentItem } from "@/lib/document-api";
import {
	acknowledgePresignedUpload,
	isDocumentVisibility,
	issuePresignedUpload,
	parseAckRequestBody,
	parsePresignRequestBody,
	toDocumentUploadErrorResponse,
} from "@/lib/document-uploads";
import {
	requireAPIKey,
	requireAPIKeyPermission,
	requireServiceAPIKey,
} from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";
import {
	buildExecutionScope,
	buildSeededInitialState,
	buildWorkflowExecutionEventData,
	mergeRequestedDocumentIds,
	parseServiceDocumentListQuery,
} from "./service.helpers";

const {
	agentGraphRuns,
	agentGraphs,
	apikeys,
	documents,
	documentDescriptions,
	organizations,
	presignedUploads,
	projects,
} = schema;

const DEFAULT_PAGE_SIZE = 20;
const MAX_SCOPED_DOCUMENTS = 500;
const jsonErrorSchema = resolver(serviceErrorResponseSchema);
const jsonSelectionErrorSchema = resolver(serviceDocumentSelectionErrorSchema);

export const serviceRouter = new Hono<HonoServerContext>({
	strict: false,
});

async function getServiceUploadTarget(c: HonoContext<HonoServerContext>) {
	const apiKey = c.get("apiKey");
	if (!apiKey) {
		throw new Error("Expected API key");
	}

	const dbClient = c.get("dbClient");
	const [uploadTarget] = await dbClient
		.select({
			organizationId: organizations.id,
			organizationSlug: organizations.slug,
			projectId: projects.id,
			projectSlug: projects.slug,
		})
		.from(apikeys)
		.innerJoin(organizations, eq(apikeys.organizationId, organizations.id))
		.innerJoin(
			projects,
			and(
				eq(apikeys.projectId, projects.id),
				eq(projects.organizationId, organizations.id),
			),
		)
		.where(eq(apikeys.id, apiKey.id))
		.limit(1);

	if (!uploadTarget) {
		throw new Error("Invalid API key context");
	}

	return {
		...uploadTarget,
		apiKeyId: apiKey.id,
		objectKeySource: "service-api",
	};
}

async function resolveScopedDocumentIds(
	c: HonoContext<HonoServerContext>,
	input: {
		documentIds?: string[];
		scope?: {
			apiKeyIds?: string[];
			documentIds?: string[];
			apiKeyBound?: boolean;
		};
	},
) {
	const apiKey = c.get("apiKey");
	if (!apiKey) {
		throw new Error("Expected API key");
	}

	const dbClient = c.get("dbClient");
	const requestedDocumentIds = mergeRequestedDocumentIds(input);

	const conditions: SQL<unknown>[] = [
		eq(documents.organizationId, apiKey.organizationId),
		eq(documents.projectId, apiKey.projectId),
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
						"One or more requested documents were not found for this API key",
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

const serviceJSONBodyValidation = (
	result: {
		success: boolean;
		error?: readonly { message: string }[];
	},
	c: HonoContext<HonoServerContext>,
) => {
	if (!result.success) {
		return c.json(
			{ message: result.error?.[0]?.message ?? "Invalid request body" },
			400,
		);
	}
};

serviceRouter.post(
	"/service/uploads/presign",
	describeRoute({
		tags: ["Service"],
		summary: "Create a presigned upload",
		description:
			"Reserves an upload slot for a service client. Visibility is declared here and applied when the upload is acknowledged.",
		responses: {
			200: {
				description: "Presigned upload created",
				content: {
					"application/json": {
						schema: resolver(serviceUploadPresignResponseSchema),
					},
				},
			},
			400: {
				description: "Invalid request",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("uploads", "presign"),
	validator(
		"json",
		serviceUploadPresignRequestSchema,
		serviceJSONBodyValidation,
	),
	async (c) => {
		try {
			const dbClient = c.get("dbClient");
			const s3Client = c.get("s3Client");
			const body = c.req.valid("json");
			const { contentType, visibility } = parsePresignRequestBody(body);
			const uploadTarget = await getServiceUploadTarget(c);

			return c.json(
				await issuePresignedUpload({
					dbClient,
					s3Client,
					target: uploadTarget,
					contentType,
					documentVisibility: visibility ?? "private",
				}),
			);
		} catch (error) {
			return toDocumentUploadErrorResponse(
				c,
				error,
				"Failed to create presigned upload",
			);
		}
	},
);

serviceRouter.post(
	"/service/uploads/ack",
	describeRoute({
		tags: ["Service"],
		summary: "Acknowledge an upload",
		description:
			"Verifies the uploaded object and creates the document using the visibility declared during presign.",
		responses: {
			200: {
				description: "Upload acknowledged",
				content: {
					"application/json": {
						schema: resolver(serviceUploadAcknowledgeResponseSchema),
					},
				},
			},
			400: {
				description: "Invalid request",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			404: {
				description: "Upload not found",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("uploads", "ack"),
	validator(
		"json",
		serviceUploadAcknowledgeRequestSchema,
		serviceJSONBodyValidation,
	),
	async (c) => {
		try {
			const apiKey = c.get("apiKey");
			if (!apiKey) {
				throw new Error("Expected API key");
			}

			const dbClient = c.get("dbClient");
			const s3Client = c.get("s3Client");
			const body = c.req.valid("json");
			const { objectKey } = parseAckRequestBody(body);
			const [uploadForKey] = await dbClient
				.select({
					id: presignedUploads.id,
					bucket: presignedUploads.bucket,
					objectKey: presignedUploads.objectKey,
					organizationId: presignedUploads.organizationId,
					projectId: presignedUploads.projectId,
					apiKeyId: presignedUploads.apiKeyId,
					visibility: presignedUploads.visibility,
				})
				.from(presignedUploads)
				.where(
					and(
						eq(presignedUploads.organizationId, apiKey.organizationId),
						eq(presignedUploads.projectId, apiKey.projectId),
						eq(presignedUploads.apiKeyId, apiKey.id),
						eq(presignedUploads.objectKey, objectKey),
						eq(presignedUploads.status, "issued"),
					),
				)
				.limit(1);

			if (!uploadForKey) {
				return c.json(
					{ message: "Upload objectKey is not valid for this API key" },
					404,
				);
			}

			if (!isDocumentVisibility(uploadForKey.visibility)) {
				return c.json({ message: "Upload has invalid visibility" }, 500);
			}

			return c.json(
				await acknowledgePresignedUpload({
					dbClient,
					s3Client,
					upload: {
						...uploadForKey,
						visibility: uploadForKey.visibility,
					},
					queueProcessing: { enabled: false },
				}),
			);
		} catch (error) {
			return toDocumentUploadErrorResponse(
				c,
				error,
				"Failed to acknowledge upload",
			);
		}
	},
);

serviceRouter.post(
	"/service/workflow-executions",
	describeRoute({
		tags: ["Service"],
		summary: "Start a workflow execution",
		description:
			"Queues a workflow against an explicit document list or a resolved scoped selection within the API key's project.",
		responses: {
			202: {
				description: "Workflow execution accepted",
				content: {
					"application/json": {
						schema: resolver(serviceWorkflowExecutionAcceptedSchema),
					},
				},
			},
			400: {
				description: "Invalid request or selection",
				content: {
					"application/json": { schema: jsonSelectionErrorSchema },
				},
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			404: {
				description: "Workflow or document not found",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			502: {
				description: "Failed to enqueue execution",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("workflows", "execute"),
	validator(
		"json",
		serviceWorkflowExecutionRequestSchema,
		serviceJSONBodyValidation,
	),
	async (c) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const body = c.req.valid("json");

		const dbClient = c.get("dbClient");
		const inngestClient = c.get("inngestClient");
		const workflow = await dbClient.query.agentGraphs.findFirst({
			where: (row, { and, eq }) =>
				and(
					eq(row.id, body.workflowId),
					eq(row.organizationId, apiKey.organizationId),
				),
			columns: {
				id: true,
			},
		});
		if (!workflow) {
			return c.json({ message: "Workflow not found" }, 404);
		}

		const scopedDocumentResolution = await resolveScopedDocumentIds(c, body);
		if (!scopedDocumentResolution.ok) {
			return c.json(
				scopedDocumentResolution.body,
				scopedDocumentResolution.status,
			);
		}

		if (scopedDocumentResolution.documentIds.length === 0) {
			return c.json(
				{ message: "No accessible documents matched the request" },
				400,
			);
		}

		const executionId = crypto.randomUUID();
		const executionScope = buildExecutionScope(
			body.scope,
			scopedDocumentResolution.documentIds,
		);
		const seededState = buildSeededInitialState(
			body.initialState,
			apiKey.projectId,
			executionScope,
		);

		await dbClient.insert(agentGraphRuns).values({
			id: executionId,
			agentGraphId: workflow.id,
			projectId: apiKey.projectId,
			status: "running",
			initialState: seededState,
		});

		try {
			await inngestClient.send({
				name: "workflow/execute",
				data: buildWorkflowExecutionEventData(
					executionId,
					workflow.id,
					scopedDocumentResolution.documentIds,
					executionScope,
					seededState,
				),
			});
		} catch (error) {
			await dbClient
				.update(agentGraphRuns)
				.set({
					status: "failed",
					error:
						error instanceof Error
							? error.message
							: "Failed to enqueue execution",
					finishedAt: new Date(),
				})
				.where(eq(agentGraphRuns.id, executionId));

			return c.json({ message: "Failed to enqueue workflow execution" }, 502);
		}

		return c.json(
			{
				executionId,
				workflowId: workflow.id,
				status: "running",
				documentIds: scopedDocumentResolution.documentIds,
				documentCount: scopedDocumentResolution.documentIds.length,
			},
			202,
		);
	},
);

serviceRouter.get(
	"/service/workflows",
	describeRoute({
		tags: ["Service"],
		summary: "List workflows",
		description:
			"Lists workflows visible to the calling service API key's organization.",
		responses: {
			200: {
				description: "Available workflows",
				content: {
					"application/json": {
						schema: resolver(serviceWorkflowsResponseSchema),
					},
				},
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("workflows", "read"),
	async (c) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const dbClient = c.get("dbClient");
		const workflows = await dbClient
			.select({
				id: agentGraphs.id,
				name: agentGraphs.name,
				description: agentGraphs.description,
				stateSchema: agentGraphs.stateSchema,
				updatedAt: agentGraphs.updatedAt,
			})
			.from(agentGraphs)
			.where(eq(agentGraphs.organizationId, apiKey.organizationId))
			.orderBy(asc(agentGraphs.name), asc(agentGraphs.id));

		return c.json({
			workflows: workflows.map((workflow) => ({
				id: workflow.id,
				name: workflow.name,
				description: workflow.description,
				stateSchema:
					workflow.stateSchema &&
					typeof workflow.stateSchema === "object" &&
					!Array.isArray(workflow.stateSchema)
						? workflow.stateSchema
						: null,
				updatedAt: workflow.updatedAt.toISOString(),
			})),
		});
	},
);

serviceRouter.get(
	"/service/workflow-executions/:id",
	describeRoute({
		tags: ["Service"],
		summary: "Read a workflow execution",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: { type: "string" },
			},
		],
		responses: {
			200: {
				description: "Execution state",
				content: {
					"application/json": {
						schema: resolver(serviceWorkflowExecutionItemSchema),
					},
				},
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			404: {
				description: "Execution not found",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("workflows", "read"),
	async (c) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const dbClient = c.get("dbClient");
		const [row] = await dbClient
			.select({
				id: agentGraphRuns.id,
				agentGraphId: agentGraphRuns.agentGraphId,
				projectId: agentGraphRuns.projectId,
				status: agentGraphRuns.status,
				error: agentGraphRuns.error,
				finalState: agentGraphRuns.finalState,
				startedAt: agentGraphRuns.startedAt,
				finishedAt: agentGraphRuns.finishedAt,
				organizationId: agentGraphs.organizationId,
			})
			.from(agentGraphRuns)
			.innerJoin(agentGraphs, eq(agentGraphRuns.agentGraphId, agentGraphs.id))
			.where(eq(agentGraphRuns.id, c.req.param("id")))
			.limit(1);

		if (!row || row.organizationId !== apiKey.organizationId) {
			return c.json({ message: "Execution not found" }, 404);
		}

		if (row.projectId !== apiKey.projectId) {
			return c.json({ message: "Execution not found" }, 404);
		}

		return c.json({
			executionId: row.id,
			workflowId: row.agentGraphId,
			status: row.status,
			startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
			finishedAt: row.finishedAt
				? new Date(row.finishedAt).toISOString()
				: null,
			error: row.error,
			finalState: row.finalState ?? null,
		});
	},
);

serviceRouter.get(
	"/service/documents",
	describeRoute({
		tags: ["Service"],
		summary: "List documents",
		parameters: [
			{
				name: "limit",
				in: "query",
				required: false,
				schema: { type: "integer", minimum: 1, maximum: 100 },
			},
			{
				name: "cursor",
				in: "query",
				required: false,
				schema: { type: "string" },
			},
			{
				name: "documentIds",
				in: "query",
				required: false,
				description: "Comma-separated document ids.",
				style: "form",
				explode: false,
				schema: {
					type: "array",
					items: { type: "string" },
				},
			},
			{
				name: "apiKeyIds",
				in: "query",
				required: false,
				description: "Comma-separated API key ids.",
				style: "form",
				explode: false,
				schema: {
					type: "array",
					items: { type: "string" },
				},
			},
			{
				name: "apiKeyBound",
				in: "query",
				required: false,
				description:
					"True for only API-key-bound documents, false for only unattached documents.",
				schema: { type: "boolean" },
			},
		],
		responses: {
			200: {
				description: "Document page",
				content: {
					"application/json": {
						schema: resolver(serviceDocumentsResponseSchema),
					},
				},
			},
			400: {
				description: "Invalid filters",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("documents", "list"),
	async (c) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const dbClient = c.get("dbClient");
		const s3Client = c.get("s3Client");
		const filters = parseServiceDocumentListQuery({
			limit: c.req.query("limit"),
			cursor: c.req.query("cursor"),
			documentIds: c.req.query("documentIds"),
			apiKeyIds: c.req.query("apiKeyIds"),
			apiKeyBound: c.req.query("apiKeyBound"),
		});
		if (!filters.ok) {
			return c.json({ message: filters.message }, 400);
		}

		const limit = filters.data.limit ?? DEFAULT_PAGE_SIZE;
		const conditions: SQL<unknown>[] = [
			eq(documents.organizationId, apiKey.organizationId),
			eq(documents.projectId, apiKey.projectId),
		];

		if (filters.data.cursor) {
			conditions.push(lt(documents.id, filters.data.cursor));
		}
		if ((filters.data.documentIds?.length ?? 0) > 0) {
			conditions.push(inArray(documents.id, filters.data.documentIds ?? []));
		}
		if ((filters.data.apiKeyIds?.length ?? 0) > 0) {
			conditions.push(
				inArray(documents.apiKeyId, filters.data.apiKeyIds ?? []),
			);
		}
		if (filters.data.apiKeyBound === true) {
			conditions.push(isNotNull(documents.apiKeyId));
		}
		if (filters.data.apiKeyBound === false) {
			conditions.push(isNull(documents.apiKeyId));
		}

		const rows = await dbClient
			.select({
				id: documents.id,
				objectKey: documents.objectKey,
				contentType: documents.contentType,
				sizeBytes: documents.sizeBytes,
				createdAt: documents.createdAt,
				description: documentDescriptions.text,
				visibility: documents.visibility,
				apiKeyId: documents.apiKeyId,
			})
			.from(documents)
			.leftJoin(
				documentDescriptions,
				eq(documents.id, documentDescriptions.documentId),
			)
			.where(and(...conditions))
			.orderBy(desc(documents.id))
			.limit(limit + 1);

		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;

		return c.json({
			documents: page.map((row) => toAPIDocumentItem(row, s3Client)),
			nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
		});
	},
);

serviceRouter.get(
	"/service/documents/:id",
	describeRoute({
		tags: ["Service"],
		summary: "Read a document",
		parameters: [
			{
				name: "id",
				in: "path",
				required: true,
				schema: { type: "string" },
			},
		],
		responses: {
			200: {
				description: "Document",
				content: {
					"application/json": {
						schema: resolver(serviceDocumentItemSchema),
					},
				},
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			404: {
				description: "Document not found",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("documents", "read"),
	async (c) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const dbClient = c.get("dbClient");
		const s3Client = c.get("s3Client");
		const [row] = await dbClient
			.select({
				id: documents.id,
				objectKey: documents.objectKey,
				contentType: documents.contentType,
				sizeBytes: documents.sizeBytes,
				createdAt: documents.createdAt,
				description: documentDescriptions.text,
				visibility: documents.visibility,
				apiKeyId: documents.apiKeyId,
				organizationId: documents.organizationId,
				projectId: documents.projectId,
			})
			.from(documents)
			.leftJoin(
				documentDescriptions,
				eq(documents.id, documentDescriptions.documentId),
			)
			.where(eq(documents.id, c.req.param("id")))
			.limit(1);

		if (
			!row ||
			row.organizationId !== apiKey.organizationId ||
			row.projectId !== apiKey.projectId
		) {
			return c.json({ message: "Document not found" }, 404);
		}

		return c.json(toAPIDocumentItem(row, s3Client));
	},
);

serviceRouter.post(
	"/service/documents/visibility",
	describeRoute({
		tags: ["Service"],
		summary: "Update document visibility",
		responses: {
			200: {
				description: "Visibility updated",
				content: {
					"application/json": {
						schema: resolver(
							serviceDocumentVisibilityUpdateSchema.pick({
								documentIds: true,
								visibility: true,
							}),
						),
					},
				},
			},
			400: {
				description: "Invalid request",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			401: {
				description: "Unauthorized",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			403: {
				description: "Forbidden",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
			404: {
				description: "Document not found",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("documents", "visibility"),
	validator(
		"json",
		serviceDocumentVisibilityUpdateSchema,
		serviceJSONBodyValidation,
	),
	async (c) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		const body = c.req.valid("json");

		const dbClient = c.get("dbClient");
		const matches = await dbClient
			.select({ id: documents.id })
			.from(documents)
			.where(
				and(
					eq(documents.organizationId, apiKey.organizationId),
					eq(documents.projectId, apiKey.projectId),
					inArray(documents.id, body.documentIds),
				),
			);

		if (matches.length !== body.documentIds.length) {
			return c.json({ message: "One or more documents were not found" }, 404);
		}

		await dbClient
			.update(documents)
			.set({
				visibility: body.visibility,
				updatedAt: new Date(),
			})
			.where(inArray(documents.id, body.documentIds));

		return c.json({
			documentIds: body.documentIds,
			visibility: body.visibility,
		});
	},
);
