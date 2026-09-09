import { schema } from "@arcnem-vision/db";
import type { PGDB } from "@arcnem-vision/db/server";
import {
	type ServiceUploadAcknowledgeResponse,
	serviceDocumentItemSchema,
	serviceDocumentSearchRequestSchema,
	serviceDocumentSearchResponseSchema,
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
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Hono, type Context as HonoContext } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import {
	acknowledgePresignedUpload,
	isDocumentVisibility,
	issuePresignedUpload,
	parseAckRequestBody,
	parsePresignRequestBody,
	toDocumentUploadErrorResponse,
} from "@/lib/document-uploads";
import {
	getServiceDocument,
	getServiceExecution,
	listServiceDocuments,
	searchServiceDocuments,
} from "@/lib/service-data";
import { ServiceError } from "@/lib/service-error";
import { executeServiceWorkflow } from "@/lib/service-workflows";
import {
	requireAPIKey,
	requireAPIKeyPermission,
	requireServiceAPIKey,
} from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";
import { parseServiceDocumentListQuery } from "./service.helpers";

const {
	agentGraphs,
	apikeys,
	documents,
	organizations,
	presignedUploads,
	projects,
} = schema;

const jsonErrorSchema = resolver(serviceErrorResponseSchema);
const jsonSelectionErrorSchema = resolver(serviceDocumentSelectionErrorSchema);

export const serviceRouter = new Hono<HonoServerContext>({
	strict: false,
});

type ServiceKeyScope = {
	id: string;
	organizationId: string;
	projectId: string;
};

async function findServiceUpload(
	dbClient: PGDB,
	apiKey: ServiceKeyScope,
	filter: { objectKey: string } | { idempotencyKey: string },
) {
	const [upload] = await dbClient
		.select()
		.from(presignedUploads)
		.where(
			and(
				eq(presignedUploads.organizationId, apiKey.organizationId),
				eq(presignedUploads.projectId, apiKey.projectId),
				eq(presignedUploads.apiKeyId, apiKey.id),
				"objectKey" in filter
					? eq(presignedUploads.objectKey, filter.objectKey)
					: eq(presignedUploads.idempotencyKey, filter.idempotencyKey),
			),
		)
		.limit(1);

	return upload;
}

async function findAcknowledgedServiceUpload(
	dbClient: PGDB,
	upload: {
		id: string;
		bucket: string;
		objectKey: string;
		organizationId: string;
		projectId: string;
		apiKeyId: string | null;
	},
): Promise<ServiceUploadAcknowledgeResponse | undefined> {
	if (!upload.apiKeyId) {
		return undefined;
	}

	const [document] = await dbClient
		.select({ id: documents.id })
		.from(documents)
		.where(
			and(
				eq(documents.bucket, upload.bucket),
				eq(documents.objectKey, upload.objectKey),
				eq(documents.organizationId, upload.organizationId),
				eq(documents.projectId, upload.projectId),
				eq(documents.apiKeyId, upload.apiKeyId),
			),
		)
		.limit(1);

	return document
		? {
				status: "verified",
				documentId: document.id,
				presignedUploadId: upload.id,
			}
		: undefined;
}

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

const serviceJSONBodyValidation = (
	result: {
		success: boolean;
		error?: readonly { message: string }[];
	},
	c: Pick<HonoContext, "json">,
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
			409: {
				description: "Idempotency key conflict",
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
			const { idempotencyKey } = body;
			let uploadForKey = idempotencyKey
				? await findServiceUpload(dbClient, apiKey, { idempotencyKey })
				: undefined;
			if (uploadForKey && uploadForKey.objectKey !== objectKey) {
				return c.json(
					{ message: "Idempotency key was already used with different input" },
					409,
				);
			}

			uploadForKey ??= await findServiceUpload(dbClient, apiKey, { objectKey });
			if (!uploadForKey) {
				return c.json(
					{ message: "Upload objectKey is not valid for this API key" },
					404,
				);
			}

			if (idempotencyKey && uploadForKey.idempotencyKey !== idempotencyKey) {
				if (uploadForKey.idempotencyKey) {
					return c.json(
						{
							message: "Upload was already claimed by another idempotency key",
						},
						409,
					);
				}

				try {
					await dbClient
						.update(presignedUploads)
						.set({ idempotencyKey })
						.where(
							and(
								eq(presignedUploads.id, uploadForKey.id),
								eq(presignedUploads.apiKeyId, apiKey.id),
								isNull(presignedUploads.idempotencyKey),
							),
						);
				} catch (error) {
					if (
						!(await findServiceUpload(dbClient, apiKey, { idempotencyKey }))
					) {
						throw error;
					}
				}

				const claimedUpload = await findServiceUpload(dbClient, apiKey, {
					idempotencyKey,
				});
				if (!claimedUpload || claimedUpload.objectKey !== objectKey) {
					return c.json(
						{
							message: "Idempotency key was already used with different input",
						},
						409,
					);
				}
				uploadForKey = claimedUpload;
			}

			if (!isDocumentVisibility(uploadForKey.visibility)) {
				return c.json({ message: "Upload has invalid visibility" }, 500);
			}

			let acknowledgedUpload = await findAcknowledgedServiceUpload(
				dbClient,
				uploadForKey,
			);
			if (!acknowledgedUpload && uploadForKey.status === "issued") {
				try {
					acknowledgedUpload = await acknowledgePresignedUpload({
						dbClient,
						s3Client,
						upload: {
							...uploadForKey,
							visibility: uploadForKey.visibility,
						},
						queueProcessing: {
							enabled: false,
						},
					});
				} catch (error) {
					acknowledgedUpload = await findAcknowledgedServiceUpload(
						dbClient,
						uploadForKey,
					);
					if (!acknowledgedUpload) {
						throw error;
					}
				}
			}

			if (!acknowledgedUpload) {
				throw new Error("Verified upload is missing its document");
			}

			return c.json(acknowledgedUpload);
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
			409: {
				description: "Idempotency key conflict",
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
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);
		const result = await executeServiceWorkflow(
			c.get("dbClient"),
			c.get("inngestClient"),
			{
				organizationId: apiKey.organizationId,
				projectId: apiKey.projectId,
				apiKeyId: apiKey.id,
			},
			c.req.valid("json"),
		);
		return c.json(result.body, result.status);
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
			.where(
				and(
					eq(agentGraphs.organizationId, apiKey.organizationId),
					isNull(agentGraphs.archivedAt),
				),
			)
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
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);
		try {
			return c.json(
				await getServiceExecution(c.get("dbClient"), apiKey, c.req.param("id")),
			);
		} catch (error) {
			if (error instanceof ServiceError)
				return c.json({ message: error.message }, error.status);
			throw error;
		}
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
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);
		const filters = parseServiceDocumentListQuery({
			limit: c.req.query("limit"),
			cursor: c.req.query("cursor"),
			documentIds: c.req.query("documentIds"),
			apiKeyIds: c.req.query("apiKeyIds"),
			apiKeyBound: c.req.query("apiKeyBound"),
		});
		if (!filters.ok) return c.json({ message: filters.message }, 400);
		return c.json(
			await listServiceDocuments(
				c.get("dbClient"),
				c.get("s3Client"),
				apiKey,
				filters.data,
			),
		);
	},
);
serviceRouter.post(
	"/service/documents/search",
	describeRoute({
		tags: ["Service"],
		summary: "Search documents",
		description:
			"Searches an explicit document allowlist within the calling service API key's organization and project.",
		responses: {
			200: {
				description: "Document search results",
				content: {
					"application/json": {
						schema: resolver(serviceDocumentSearchResponseSchema),
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
				content: {
					"application/json": { schema: jsonSelectionErrorSchema },
				},
			},
			502: {
				description: "Document search failed",
				content: { "application/json": { schema: jsonErrorSchema } },
			},
		},
	}),
	requireAPIKey,
	requireServiceAPIKey,
	requireAPIKeyPermission("documents", "search"),
	validator(
		"json",
		serviceDocumentSearchRequestSchema,
		serviceJSONBodyValidation,
	),
	async (c) => {
		const apiKey = c.get("apiKey");
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);
		try {
			return c.json(
				await searchServiceDocuments(
					c.get("dbClient"),
					apiKey,
					c.req.valid("json"),
				),
			);
		} catch (error) {
			if (error instanceof ServiceError)
				return c.json(
					{ ...error.details, message: error.message },
					error.status,
				);
			throw error;
		}
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
		if (!apiKey) return c.json({ message: "Unauthorized" }, 401);
		try {
			return c.json(
				await getServiceDocument(
					c.get("dbClient"),
					c.get("s3Client"),
					apiKey,
					c.req.param("id"),
				),
			);
		} catch (error) {
			if (error instanceof ServiceError)
				return c.json({ message: error.message }, error.status);
			throw error;
		}
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
