import { createEnvVarGetter } from "@arcnem-vision/shared";
import { S3Client } from "bun";
import { sql } from "drizzle-orm";
import {
	agentGraphEdges,
	agentGraphNodes,
	agentGraphNodeTools,
	agentGraphs,
	apikeys,
	devices,
	documentDescriptionEmbeddings,
	documentDescriptions,
	documentEmbeddings,
	documents,
	members,
	models,
	organizations,
	projects,
	sessions,
	tools,
	users,
} from "./src/schema";
import { getDB } from "./src/server";

const db = getDB();
const now = new Date();
const plainPipelineApiKey =
	"seed_X9x8U7v6W5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4Z3y2X1w0";
const plainQualityReviewApiKey =
	"seed_Q7p6N5m4L3k2J1h0G9f8D7s6A5z4X3c2V1b0N9m8K7j6H5g4F3d2S1a0P9o8";
const seedDashboardSessionToken =
	"seed_dashboard_session_s4M8xR2vJ7nK1qP5wL9cD3fH6tY0uB4";
const seedDocumentEmbeddingDim = 768;

const S3_ENV_VAR = {
	S3_ACCESS_KEY_ID: "S3_ACCESS_KEY_ID",
	S3_SECRET_ACCESS_KEY: "S3_SECRET_ACCESS_KEY",
	S3_BUCKET: "S3_BUCKET",
	S3_ENDPOINT: "S3_ENDPOINT",
	S3_REGION: "S3_REGION",
} as const;

const getS3EnvVar = createEnvVarGetter(S3_ENV_VAR);

const seedDocumentInputs = [
	{
		slug: "invoice-q1",
		imageUrl:
			"https://dummyimage.com/1200x1600/ffffff/111111.png&text=Invoice+Q1",
		description:
			"Invoice document with vendor header, line items, subtotal, tax, and total amount due.",
	},
	{
		slug: "medical-intake",
		imageUrl:
			"https://dummyimage.com/1200x1600/ffffff/111111.png&text=Medical+Intake+Form",
		description:
			"Medical intake form with patient demographics, checkbox symptoms, and provider signature area.",
	},
	{
		slug: "rental-application",
		imageUrl:
			"https://dummyimage.com/1200x1600/ffffff/111111.png&text=Rental+Application",
		description:
			"Rental application containing applicant details, employment history, references, and consent section.",
	},
] as const;

const seedQualityReviewDocumentInputs = [
	{
		slug: "blurry-receipt",
		imageUrl:
			"https://dummyimage.com/1200x1600/f5f5dc/333333.png&text=Blurry+Receipt",
		description:
			"Blurry photograph of a retail receipt with motion blur, partially legible line items and total.",
	},
	{
		slug: "sharp-passport",
		imageUrl:
			"https://dummyimage.com/1200x1600/e8f0fe/111111.png&text=Sharp+Passport+Scan",
		description:
			"High-quality passport scan with clear photo, MRZ code, and all biographical fields legible.",
	},
	{
		slug: "dark-contract",
		imageUrl:
			"https://dummyimage.com/1200x1600/2a2a2a/888888.png&text=Underexposed+Contract",
		description:
			"Underexposed photograph of a multi-page contract with poor lighting and low contrast text.",
	},
] as const;

type UploadedSeedDocument = {
	slug: string;
	objectKey: string;
	contentType: string;
	eTag: string;
	sizeBytes: number;
	lastModifiedAt: Date;
	description: string;
};

const hashApiKey = async (key: string): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(key),
	);

	return Buffer.from(digest).toString("base64url");
};

const createDeterministicEmbedding = (
	seed: string,
	dim = seedDocumentEmbeddingDim,
): number[] => {
	let state = 2166136261;
	for (const character of seed) {
		state ^= character.charCodeAt(0);
		state = Math.imul(state, 16777619) >>> 0;
	}

	const embedding = new Array<number>(dim);
	for (let index = 0; index < dim; index += 1) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		const normalized = (state / 4294967295) * 2 - 1;
		embedding[index] = Number(normalized.toFixed(6));
	}

	return embedding;
};

const getSeedS3Client = (): { bucket: string; client: S3Client } => {
	const bucket = getS3EnvVar("S3_BUCKET");

	return {
		bucket,
		client: new S3Client({
			accessKeyId: getS3EnvVar("S3_ACCESS_KEY_ID"),
			secretAccessKey: getS3EnvVar("S3_SECRET_ACCESS_KEY"),
			bucket,
			endpoint: getS3EnvVar("S3_ENDPOINT"),
			region: getS3EnvVar("S3_REGION"),
		}),
	};
};

const uploadSeedDocumentsToS3 = async (
	s3Client: S3Client,
	inputs: ReadonlyArray<{
		slug: string;
		imageUrl: string;
		description: string;
	}>,
	pathPrefix: string,
): Promise<UploadedSeedDocument[]> => {
	return Promise.all(
		inputs.map(async (seedDocumentInput) => {
			const response = await fetch(seedDocumentInput.imageUrl);
			if (!response.ok) {
				throw new Error(
					`Failed to fetch seed image (${response.status}): ${seedDocumentInput.imageUrl}`,
				);
			}

			const headerContentType = response.headers
				.get("content-type")
				?.toLowerCase();
			const sourceContentType = headerContentType?.startsWith("image/")
				? headerContentType
				: "image/png";
			const sourceImage = Buffer.from(await response.arrayBuffer());
			if (sourceImage.byteLength === 0) {
				throw new Error(
					`Fetched empty seed image: ${seedDocumentInput.imageUrl}`,
				);
			}

			const objectKey = `${pathPrefix}/${seedDocumentInput.slug}.png`;
			await Bun.write(s3Client.file(objectKey), sourceImage);
			const stats = await s3Client.stat(objectKey);

			const lastModifiedAt =
				stats.lastModified instanceof Date &&
				!Number.isNaN(stats.lastModified.getTime())
					? stats.lastModified
					: new Date();
			const eTag =
				typeof stats.etag === "string" && stats.etag.length > 0
					? stats.etag
					: `seed-${seedDocumentInput.slug}`;
			const contentType =
				typeof stats.type === "string" && stats.type.length > 0
					? stats.type.toLowerCase()
					: sourceContentType;

			return {
				slug: seedDocumentInput.slug,
				objectKey,
				contentType,
				eTag,
				sizeBytes:
					Number.isInteger(stats.size) && stats.size > 0
						? stats.size
						: sourceImage.byteLength,
				lastModifiedAt,
				description: seedDocumentInput.description,
			};
		}),
	);
};

const seed = async () => {
	const hashedPipelineApiKey = await hashApiKey(plainPipelineApiKey);
	const hashedQualityReviewApiKey = await hashApiKey(plainQualityReviewApiKey);
	const { bucket, client: s3Client } = getSeedS3Client();
	const uploadedSeedDocuments = await uploadSeedDocumentsToS3(
		s3Client,
		seedDocumentInputs,
		"seed/documents",
	);
	const uploadedQualityReviewDocuments = await uploadSeedDocumentsToS3(
		s3Client,
		seedQualityReviewDocumentInputs,
		"seed/quality-review",
	);

	const result = await db.transaction(async (tx) => {
		await tx.execute(sql`
			TRUNCATE TABLE
				"agent_graph_run_steps",
				"agent_graph_runs",
				"agent_graph_edges",
				"agent_graph_node_tools",
				"agent_graph_nodes",
				"agent_graphs",
				"tools",
				"document_description_embeddings",
				"document_descriptions",
				"document_embeddings",
				"documents",
				"presigned_uploads",
				"models",
				"apikeys",
				"invitations",
				"members",
				"devices",
				"projects",
				"accounts",
				"sessions",
				"verifications",
				"organizations",
				"users"
			RESTART IDENTITY CASCADE
		`);

		// ── Auth / Org / Project ──

		const [user] = await tx
			.insert(users)
			.values({
				name: "Seed User",
				email: "seed.user@arcnem.local",
				emailVerified: true,
				role: "admin",
			})
			.returning({
				id: users.id,
				email: users.email,
			});
		if (!user) throw new Error("Failed to create seed user");

		const [organization] = await tx
			.insert(organizations)
			.values({
				name: "Seed Organization",
				slug: "seed-organization",
				createdAt: now,
			})
			.returning({
				id: organizations.id,
				slug: organizations.slug,
			});
		if (!organization) throw new Error("Failed to create seed organization");

		await tx.insert(members).values({
			organizationId: organization.id,
			userId: user.id,
			role: "owner",
			createdAt: now,
		});

		const sessionExpiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);

		const [dashboardSession] = await tx
			.insert(sessions)
			.values({
				token: seedDashboardSessionToken,
				userId: user.id,
				expiresAt: sessionExpiresAt,
				ipAddress: "127.0.0.1",
				userAgent: "seed-dashboard-session",
				activeOrganizationId: organization.id,
				createdAt: now,
				updatedAt: now,
			})
			.returning({
				id: sessions.id,
				token: sessions.token,
				expiresAt: sessions.expiresAt,
			});
		if (!dashboardSession)
			throw new Error("Failed to create seed dashboard session");

		const [project] = await tx
			.insert(projects)
			.values({
				name: "Seed Project",
				slug: "seed-project",
				organizationId: organization.id,
			})
			.returning({
				id: projects.id,
				slug: projects.slug,
			});
		if (!project) throw new Error("Failed to create seed project");

		// ── Models ──

		const [clipModel] = await tx
			.insert(models)
			.values({
				provider: "REPLICATE",
				name: "openai/clip",
				type: "embedding",
				embeddingDim: 768,
			})
			.returning({ id: models.id });
		if (!clipModel) throw new Error("Failed to create CLIP model");

		const [gpt41MiniModel] = await tx
			.insert(models)
			.values({
				provider: "OPENAI",
				name: "gpt-4.1-mini",
				type: "chat",
			})
			.returning({ id: models.id });
		if (!gpt41MiniModel) throw new Error("Failed to create GPT-4.1-mini model");

		// ── Tools ──

		const [createDocDescTool] = await tx
			.insert(tools)
			.values({
				name: "create_document_description",
				description: "Save an LLM-generated text description for a document.",
				inputSchema: JSON.stringify({
					type: "object",
					properties: {
						document_id: { type: "string" },
						text: { type: "string" },
						model_provider: { type: "string" },
						model_name: { type: "string" },
					},
					required: ["document_id", "text", "model_provider", "model_name"],
				}),
				outputSchema: JSON.stringify({
					type: "object",
					properties: {
						description_id: { type: "string" },
						text: { type: "string" },
					},
				}),
			})
			.returning({ id: tools.id });
		if (!createDocDescTool)
			throw new Error("Failed to create create_document_description tool");

		const [createDocEmbTool] = await tx
			.insert(tools)
			.values({
				name: "create_document_embedding",
				description:
					"Generate a CLIP embedding for a document image and save it to the database.",
				inputSchema: JSON.stringify({
					type: "object",
					properties: {
						document_id: { type: "string" },
						temp_url: { type: "string" },
					},
					required: ["document_id", "temp_url"],
				}),
				outputSchema: JSON.stringify({
					type: "object",
					properties: {
						embedding_id: { type: "string" },
					},
				}),
			})
			.returning({ id: tools.id });
		if (!createDocEmbTool)
			throw new Error("Failed to create create_document_embedding tool");

		const [createDescEmbTool] = await tx
			.insert(tools)
			.values({
				name: "create_description_embedding",
				description:
					"Generate a CLIP text embedding for a document description and save it to the database.",
				inputSchema: JSON.stringify({
					type: "object",
					properties: {
						document_description_id: { type: "string" },
						text: { type: "string" },
					},
					required: ["document_description_id", "text"],
				}),
				outputSchema: JSON.stringify({
					type: "object",
					properties: {
						embedding_id: { type: "string" },
					},
				}),
			})
			.returning({ id: tools.id });
		if (!createDescEmbTool)
			throw new Error("Failed to create create_description_embedding tool");

		const [findSimilarDocsTool] = await tx
			.insert(tools)
			.values({
				name: "find_similar_documents",
				description:
					"Find documents with similar CLIP embeddings using cosine distance.",
				inputSchema: JSON.stringify({
					type: "object",
					properties: {
						document_id: { type: "string" },
					},
					required: ["document_id"],
				}),
				outputSchema: JSON.stringify({
					type: "object",
					properties: {
						matches: {
							type: "array",
							items: {
								type: "object",
								properties: {
									id: { type: "string" },
									distance: { type: "number" },
								},
							},
						},
					},
				}),
			})
			.returning({ id: tools.id });
		if (!findSimilarDocsTool)
			throw new Error("Failed to create find_similar_documents tool");

		const [findSimilarDescsTool] = await tx
			.insert(tools)
			.values({
				name: "find_similar_descriptions",
				description:
					"Find document descriptions with similar CLIP embeddings using cosine distance.",
				inputSchema: JSON.stringify({
					type: "object",
					properties: {
						document_description_id: { type: "string" },
					},
					required: ["document_description_id"],
				}),
				outputSchema: JSON.stringify({
					type: "object",
					properties: {
						matches: {
							type: "array",
							items: {
								type: "object",
								properties: {
									id: { type: "string" },
									distance: { type: "number" },
								},
							},
						},
					},
				}),
			})
			.returning({ id: tools.id });
		if (!findSimilarDescsTool)
			throw new Error("Failed to create find_similar_descriptions tool");

		// ── Agent Graph (workflow 1: describe → save → embed → find similar) ──

		const [pipelineGraph] = await tx
			.insert(agentGraphs)
			.values({
				name: "Document Processing Pipeline",
				description:
					"Describes a document image, saves the description, embeds both, and finds similar items.",
				entryNode: "describe",
				organizationId: organization.id,
			})
			.returning({ id: agentGraphs.id });
		if (!pipelineGraph)
			throw new Error("Failed to create pipeline agent graph");

		// Node: describe (worker) — LLM describes the image
		const [describeNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "describe",
				nodeType: "worker",
				inputKey: "temp_url",
				outputKey: "description",
				config: JSON.stringify({
					system_message:
						"You are a document analysis assistant. Given an image URL of a document, return one concise plain-text paragraph describing key contents, layout, and any visible text. Keep the output to 50 words max (about 320 characters), and do not include markdown, bullet points, or URLs.",
					max_iterations: 3,
					input_mode: "image_url",
					input_prompt:
						"Describe this document image in one concise paragraph (max 50 words). Focus on layout, key text, and visual elements.",
				}),
				agentGraphId: pipelineGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!describeNode) throw new Error("Failed to create describe node");

		// Node: save_description (tool) — saves description to DB
		const [saveDescNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "save_description",
				nodeType: "tool",
				config: JSON.stringify({
					input_mapping: {
						text: "description",
						model_provider: "_const:OPENAI",
						model_name: "_const:gpt-4.1-mini",
					},
					output_mapping: {
						description_id: "document_description_id",
					},
				}),
				agentGraphId: pipelineGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!saveDescNode)
			throw new Error("Failed to create save_description node");

		// Node: embed_document (tool) — CLIP embed the document image
		const [embedDocNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "embed_document",
				nodeType: "tool",
				config: JSON.stringify({}),
				agentGraphId: pipelineGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!embedDocNode) throw new Error("Failed to create embed_document node");

		// Node: embed_description (tool) — CLIP embed the description text
		const [embedDescNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "embed_description",
				nodeType: "tool",
				config: JSON.stringify({
					input_mapping: {
						text: "description",
						document_description_id: "document_description_id",
					},
				}),
				agentGraphId: pipelineGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!embedDescNode)
			throw new Error("Failed to create embed_description node");

		// Node: find_similar_docs (tool)
		const [findDocsNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "find_similar_docs",
				nodeType: "tool",
				config: JSON.stringify({}),
				agentGraphId: pipelineGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!findDocsNode)
			throw new Error("Failed to create find_similar_docs node");

		// Node: find_similar_descs (tool)
		const [findDescsNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "find_similar_descs",
				nodeType: "tool",
				config: JSON.stringify({}),
				agentGraphId: pipelineGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!findDescsNode)
			throw new Error("Failed to create find_similar_descs node");

		// ── Node-Tool associations ──

		await tx.insert(agentGraphNodeTools).values([
			{
				agentGraphNodeId: saveDescNode.id,
				toolId: createDocDescTool.id,
			},
			{
				agentGraphNodeId: embedDocNode.id,
				toolId: createDocEmbTool.id,
			},
			{
				agentGraphNodeId: embedDescNode.id,
				toolId: createDescEmbTool.id,
			},
			{
				agentGraphNodeId: findDocsNode.id,
				toolId: findSimilarDocsTool.id,
			},
			{
				agentGraphNodeId: findDescsNode.id,
				toolId: findSimilarDescsTool.id,
			},
		]);

		// ── Edges (linear pipeline) ──

		await tx.insert(agentGraphEdges).values([
			{
				fromNode: "describe",
				toNode: "save_description",
				agentGraphId: pipelineGraph.id,
			},
			{
				fromNode: "save_description",
				toNode: "embed_document",
				agentGraphId: pipelineGraph.id,
			},
			{
				fromNode: "embed_document",
				toNode: "embed_description",
				agentGraphId: pipelineGraph.id,
			},
			{
				fromNode: "embed_description",
				toNode: "find_similar_docs",
				agentGraphId: pipelineGraph.id,
			},
			{
				fromNode: "find_similar_docs",
				toNode: "find_similar_descs",
				agentGraphId: pipelineGraph.id,
			},
			{
				fromNode: "find_similar_descs",
				toNode: "END",
				agentGraphId: pipelineGraph.id,
			},
		]);

		// ── Device (linked to workflow 1 graph) ──

		const [pipelineDevice] = await tx
			.insert(devices)
			.values({
				name: "Seed Device",
				slug: "seed-device",
				organizationId: organization.id,
				projectId: project.id,
				agentGraphId: pipelineGraph.id,
			})
			.returning({
				id: devices.id,
				slug: devices.slug,
			});
		if (!pipelineDevice)
			throw new Error("Failed to create seed pipeline device");

		// ── API Key (workflow 1 device) ──

		const [pipelineApiKey] = await tx
			.insert(apikeys)
			.values({
				name: "Seed Device API Key",
				start: plainPipelineApiKey.slice(0, 6),
				prefix: "seed",
				key: hashedPipelineApiKey,
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				deviceId: pipelineDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: JSON.stringify({ uploads: ["presign", "ack"] }),
				metadata: JSON.stringify({ source: "seed.ts" }),
			})
			.returning({
				id: apikeys.id,
			});
		if (!pipelineApiKey)
			throw new Error("Failed to create seed pipeline API key");

		// ── Seed documents, descriptions, and embeddings ──

		const insertedDocuments = await tx
			.insert(documents)
			.values(
				uploadedSeedDocuments.map((seedDocument) => ({
					bucket,
					objectKey: seedDocument.objectKey,
					contentType: seedDocument.contentType,
					eTag: seedDocument.eTag,
					sizeBytes: seedDocument.sizeBytes,
					lastModifiedAt: seedDocument.lastModifiedAt,
					visibility: "org",
					organizationId: organization.id,
					projectId: project.id,
					deviceId: pipelineDevice.id,
				})),
			)
			.returning({
				id: documents.id,
				objectKey: documents.objectKey,
			});

		if (insertedDocuments.length !== uploadedSeedDocuments.length) {
			throw new Error("Failed to insert all seed documents");
		}

		const documentIdByObjectKey = new Map(
			insertedDocuments.map((document) => [document.objectKey, document.id]),
		);

		const seedDocumentsWithIds = uploadedSeedDocuments.map((seedDocument) => {
			const documentId = documentIdByObjectKey.get(seedDocument.objectKey);
			if (!documentId) {
				throw new Error(
					`Failed to resolve document id for ${seedDocument.objectKey}`,
				);
			}

			return {
				...seedDocument,
				documentId,
			};
		});

		const insertedDescriptions = await tx
			.insert(documentDescriptions)
			.values(
				seedDocumentsWithIds.map((seedDocument) => ({
					documentId: seedDocument.documentId,
					modelId: gpt41MiniModel.id,
					text: seedDocument.description,
				})),
			)
			.returning({
				id: documentDescriptions.id,
				documentId: documentDescriptions.documentId,
				text: documentDescriptions.text,
			});

		if (insertedDescriptions.length !== seedDocumentsWithIds.length) {
			throw new Error("Failed to insert all seed document descriptions");
		}

		await tx.insert(documentEmbeddings).values(
			seedDocumentsWithIds.map((seedDocument) => ({
				documentId: seedDocument.documentId,
				modelId: clipModel.id,
				embeddingDim: seedDocumentEmbeddingDim,
				embedding: createDeterministicEmbedding(
					`document:${seedDocument.objectKey}`,
				),
			})),
		);

		await tx.insert(documentDescriptionEmbeddings).values(
			insertedDescriptions.map((description) => ({
				documentDescriptionId: description.id,
				modelId: clipModel.id,
				embeddingDim: seedDocumentEmbeddingDim,
				embedding: createDeterministicEmbedding(
					`description:${description.documentId}:${description.text}`,
				),
			})),
		);

		// ── Agent Graph (workflow 2: supervisor routes to good vs bad image-quality workers) ──

		const [qualityReviewGraph] = await tx
			.insert(agentGraphs)
			.values({
				name: "Image Quality Review",
				description:
					"Routes an uploaded image to either a good-quality reviewer or a bad-quality reviewer, then returns a detailed justification.",
				entryNode: "quality_review_supervisor",
				organizationId: organization.id,
			})
			.returning({ id: agentGraphs.id });
		if (!qualityReviewGraph)
			throw new Error("Failed to create quality review agent graph");

		const [goodImageQualityWorkerNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "image_quality_good_worker",
				nodeType: "worker",
				config: JSON.stringify({
					system_message:
						"You are the GOOD image-quality specialist. Use this route only when the image quality is acceptable for downstream document analysis. Given an image URL, explain in detail why the image is good enough. Cover sharpness/focus, exposure and contrast, framing/cropping, legibility of text, noise/compression artifacts, and whether the full document content appears captured. Mention minor flaws if present, but keep the final judgment clearly positive. End with a one-line verdict that starts with 'Verdict: GOOD'.",
					max_iterations: 4,
				}),
				agentGraphId: qualityReviewGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!goodImageQualityWorkerNode)
			throw new Error("Failed to create image_quality_good_worker node");

		const [badImageQualityWorkerNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "image_quality_bad_worker",
				nodeType: "worker",
				config: JSON.stringify({
					system_message:
						"You are the BAD image-quality specialist. Use this route only when the image quality is not acceptable for downstream document analysis. Given an image URL, explain in detail why the image is bad. Be specific about failure points such as blur, motion blur, poor exposure, glare, cropping, skew/perspective distortion, low resolution, illegible text, and compression artifacts. Include concrete remediation steps so the user can retake the image successfully. End with a one-line verdict that starts with 'Verdict: BAD'.",
					max_iterations: 4,
				}),
				agentGraphId: qualityReviewGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!badImageQualityWorkerNode)
			throw new Error("Failed to create image_quality_bad_worker node");

		const [qualityReviewSupervisorNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "quality_review_supervisor",
				nodeType: "supervisor",
				inputKey: "temp_url",
				outputKey: "quality_review",
				config: JSON.stringify({
					members: ["image_quality_good_worker", "image_quality_bad_worker"],
					input_mode: "image_url",
					input_prompt:
						"Route this image to exactly one specialist based on quality. After that specialist responds, finish.",
					max_iterations: 10,
				}),
				agentGraphId: qualityReviewGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!qualityReviewSupervisorNode)
			throw new Error("Failed to create quality_review_supervisor node");

		// No edges needed for supervisor graphs — BuildGraph auto-wires:
		// - supervisor -> members (conditional edge from routing decision)
		// - members -> supervisor (static edges back)
		// - supervisor -> END (conditional edge when FINISH)

		// ── Device + API key (workflow 2 graph) ──

		const [qualityReviewDevice] = await tx
			.insert(devices)
			.values({
				name: "Seed Quality Review Device",
				slug: "seed-quality-review-device",
				organizationId: organization.id,
				projectId: project.id,
				agentGraphId: qualityReviewGraph.id,
			})
			.returning({
				id: devices.id,
				slug: devices.slug,
			});
		if (!qualityReviewDevice)
			throw new Error("Failed to create seed quality review device");

		const [qualityReviewApiKey] = await tx
			.insert(apikeys)
			.values({
				name: "Seed Quality Review Device API Key",
				start: plainQualityReviewApiKey.slice(0, 6),
				prefix: "seed",
				key: hashedQualityReviewApiKey,
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				deviceId: qualityReviewDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: JSON.stringify({ uploads: ["presign", "ack"] }),
				metadata: JSON.stringify({
					source: "seed.ts",
					workflow: "quality-review",
				}),
			})
			.returning({
				id: apikeys.id,
			});
		if (!qualityReviewApiKey)
			throw new Error("Failed to create seed quality review API key");

		// ── Seed documents for quality review device ──

		const insertedQRDocuments = await tx
			.insert(documents)
			.values(
				uploadedQualityReviewDocuments.map((seedDocument) => ({
					bucket,
					objectKey: seedDocument.objectKey,
					contentType: seedDocument.contentType,
					eTag: seedDocument.eTag,
					sizeBytes: seedDocument.sizeBytes,
					lastModifiedAt: seedDocument.lastModifiedAt,
					visibility: "org",
					organizationId: organization.id,
					projectId: project.id,
					deviceId: qualityReviewDevice.id,
				})),
			)
			.returning({
				id: documents.id,
				objectKey: documents.objectKey,
			});

		if (insertedQRDocuments.length !== uploadedQualityReviewDocuments.length) {
			throw new Error("Failed to insert all quality review seed documents");
		}

		const qrDocumentIdByObjectKey = new Map(
			insertedQRDocuments.map((document) => [document.objectKey, document.id]),
		);

		const qrSeedDocumentsWithIds = uploadedQualityReviewDocuments.map(
			(seedDocument) => {
				const documentId = qrDocumentIdByObjectKey.get(seedDocument.objectKey);
				if (!documentId) {
					throw new Error(
						`Failed to resolve document id for ${seedDocument.objectKey}`,
					);
				}

				return {
					...seedDocument,
					documentId,
				};
			},
		);

		const insertedQRDescriptions = await tx
			.insert(documentDescriptions)
			.values(
				qrSeedDocumentsWithIds.map((seedDocument) => ({
					documentId: seedDocument.documentId,
					modelId: gpt41MiniModel.id,
					text: seedDocument.description,
				})),
			)
			.returning({
				id: documentDescriptions.id,
				documentId: documentDescriptions.documentId,
				text: documentDescriptions.text,
			});

		if (insertedQRDescriptions.length !== qrSeedDocumentsWithIds.length) {
			throw new Error(
				"Failed to insert all quality review seed document descriptions",
			);
		}

		await tx.insert(documentEmbeddings).values(
			qrSeedDocumentsWithIds.map((seedDocument) => ({
				documentId: seedDocument.documentId,
				modelId: clipModel.id,
				embeddingDim: seedDocumentEmbeddingDim,
				embedding: createDeterministicEmbedding(
					`document:${seedDocument.objectKey}`,
				),
			})),
		);

		await tx.insert(documentDescriptionEmbeddings).values(
			insertedQRDescriptions.map((description) => ({
				documentDescriptionId: description.id,
				modelId: clipModel.id,
				embeddingDim: seedDocumentEmbeddingDim,
				embedding: createDeterministicEmbedding(
					`description:${description.documentId}:${description.text}`,
				),
			})),
		);

		return {
			user,
			dashboardSession,
			organization,
			project,
			pipelineDevice,
			pipelineApiKey,
			pipelineGraph,
			qualityReviewDevice,
			qualityReviewApiKey,
			qualityReviewGraph,
			clipModel,
			gpt41MiniModel,
			seededDocuments: seedDocumentsWithIds,
			seededDescriptionCount: insertedDescriptions.length,
			seededQRDocuments: qrSeedDocumentsWithIds,
			seededQRDescriptionCount: insertedQRDescriptions.length,
		};
	});

	console.log("\nSeed complete\n");
	console.log(`User: ${result.user.email} (${result.user.id})`);
	console.log(`Session ID: ${result.dashboardSession.id}`);
	console.log(`Session Token (dashboard): ${result.dashboardSession.token}`);
	console.log(
		`Session Expires At: ${result.dashboardSession.expiresAt.toISOString()}`,
	);
	console.log(
		"Use cookie `better-auth.session_token` with the session token for local dashboard auth.",
	);
	console.log(
		`Organization: ${result.organization.slug} (${result.organization.id})`,
	);
	console.log(`Project: ${result.project.slug} (${result.project.id})`);
	console.log(
		`Device (workflow 1): ${result.pipelineDevice.slug} (${result.pipelineDevice.id})`,
	);
	console.log(`API Key ID (workflow 1): ${result.pipelineApiKey.id}`);
	console.log(`API Key (plain, workflow 1): ${plainPipelineApiKey}`);
	console.log(
		`Device (workflow 2): ${result.qualityReviewDevice.slug} (${result.qualityReviewDevice.id})`,
	);
	console.log(`API Key ID (workflow 2): ${result.qualityReviewApiKey.id}`);
	console.log(`API Key (plain, workflow 2): ${plainQualityReviewApiKey}`);
	console.log(`\nAgent Graph (workflow 1): ${result.pipelineGraph.id}`);
	console.log(`Agent Graph (workflow 2): ${result.qualityReviewGraph.id}`);
	console.log(`CLIP Model: ${result.clipModel.id}`);
	console.log(`GPT-4.1 Mini Model: ${result.gpt41MiniModel.id}`);
	console.log(`Seeded documents (pipeline): ${result.seededDocuments.length}`);
	console.log(
		`Seeded descriptions (pipeline): ${result.seededDescriptionCount}`,
	);
	for (const seededDocument of result.seededDocuments) {
		console.log(
			`  Pipeline doc: ${seededDocument.objectKey} (${seededDocument.documentId})`,
		);
	}
	console.log(
		`Seeded documents (quality review): ${result.seededQRDocuments.length}`,
	);
	console.log(
		`Seeded descriptions (quality review): ${result.seededQRDescriptionCount}`,
	);
	for (const seededDocument of result.seededQRDocuments) {
		console.log(
			`  QR doc: ${seededDocument.objectKey} (${seededDocument.documentId})`,
		);
	}
};

seed()
	.catch((error) => {
		console.error("Seed failed", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$client.end();
	});
