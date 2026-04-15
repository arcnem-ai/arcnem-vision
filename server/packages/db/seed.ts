import { extname } from "node:path";
import {
	createEnvVarGetter,
	DEFAULT_DEVICE_API_KEY_PERMISSIONS,
	DEFAULT_SERVICE_API_KEY_PERMISSIONS,
} from "@arcnem-vision/shared";
import { S3Client } from "bun";
import { eq, sql } from "drizzle-orm";
import {
	agentGraphEdges,
	agentGraphNodes,
	agentGraphNodeTools,
	agentGraphRunSteps,
	agentGraphRuns,
	agentGraphs,
	agentGraphTemplates,
	agentGraphTemplateVersions,
	apikeys,
	devices,
	documentDescriptionEmbeddings,
	documentDescriptions,
	documentEmbeddings,
	documentOCRResults,
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
type SeedTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const now = new Date();
const plainPipelineApiKey =
	"seed_X9x8U7v6W5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4Z3y2X1w0";
const plainQualityReviewApiKey =
	"seed_Q7p6N5m4L3k2J1h0G9f8D7s6A5z4X3c2V1b0N9m8K7j6H5g4F3d2S1a0P9o8";
const plainSegmentationApiKey =
	"seed_seg_G4m2L8p1Q7r9S3t5U6v0W2x4Y8z1A3b5C7d9E0f2H4j6K8m0N2p4";
const plainSemanticSegmentationApiKey =
	"seed_sem_H6n3P8q2R5s9T1u4V7w0X3y6Z8a2B4c6D9e1F3g5J7k9M0n2P4";
const plainOCRConditionApiKey =
	"seed_ocr_cond_D9m2P5q8R1s4T7u0V3w6X9y2Z5a8B1c4D7e0F3g6H9j2";
const plainOCRSupervisorApiKey =
	"seed_ocr_sup_G7n4Q1r8S5t2U9v6W3x0Y7z4A1b8C5d2E9f6G3h0J7k4";
const plainServiceApiKey =
	"seed_srv_J5m8Q2r6S9t3U7v1W4x8Y2z6A9b3C7d1E4f8G2h6J9k3L7m1P4";
const seededRemoteSensingWorkflowId = "019d90bd-b369-7653-944e-a4832e34a16d";
const seedDashboardSessionToken =
	"seed_dashboard_session_s4M8xR2vJ7nK1qP5wL9cD3fH6tY0uB4";
const seededDashboardUserEmail =
	process.env.SEED_DASHBOARD_USER_EMAIL?.trim().toLowerCase() ?? "";
const seedDocumentEmbeddingDim = 768;
const semanticSegmentAnythingVersion =
	"b2691db53f2d96add0051a4a98e7a3861bd21bf5972031119d344d956d2f8256";
const langSegmentAnythingVersion =
	"891411c38a6ed2d44c004b7b9e44217df7a5b07848f29ddefd2e28bc7cbf93bc";
const deepseekOCRVersion =
	"cb3b474fbfc56b1664c8c7841550bccecbe7b74c30e45ce938ffca1180b4dff5";
const dotsOCRVersion =
	"91ce60f4885d7ca6e095755e25d0f9ff2bcfe963c816937ece4be50d811f26c4";
const deviceAPIKeyPermissionsJSON = JSON.stringify(
	DEFAULT_DEVICE_API_KEY_PERMISSIONS,
);
const serviceAPIKeyPermissionsJSON = JSON.stringify(
	DEFAULT_SERVICE_API_KEY_PERMISSIONS,
);

const S3_ENV_VAR = {
	S3_ACCESS_KEY_ID: "S3_ACCESS_KEY_ID",
	S3_SECRET_ACCESS_KEY: "S3_SECRET_ACCESS_KEY",
	S3_BUCKET: "S3_BUCKET",
	S3_ENDPOINT: "S3_ENDPOINT",
	S3_REGION: "S3_REGION",
} as const;

const getS3EnvVar = createEnvVarGetter(S3_ENV_VAR);

type SeedDocumentInput = {
	slug: string;
	fileName: string;
	description: string;
};

type SeedOCRDocumentInput = SeedDocumentInput & {
	ocrText: string;
	savedSummary: string;
	avgConfidence?: number;
};

const seedDocumentInputs = [
	{
		slug: "mountain-vista",
		fileName: "mountain-vista.jpg",
		description:
			"Snowy mountain valley with rugged peaks, bright sky, and a broad view across the ridgeline.",
	},
	{
		slug: "vintage-car",
		fileName: "vintage-car.jpg",
		description:
			"Low-angle photograph of a vintage black car parked on a city street with warm sepia tones.",
	},
	{
		slug: "brown-dogs",
		fileName: "brown-dogs.jpg",
		description:
			"Two reddish-brown dogs sniffing bright green grass with a blue fence softly blurred behind them.",
	},
] as const satisfies ReadonlyArray<SeedDocumentInput>;

const seedQualityReviewDocumentInputs = [
	{
		slug: "soft-focus-cat",
		fileName: "soft-focus-cat.jpg",
		description:
			"Extreme close-up of a cat's nose with shallow depth of field that leaves most of the frame softly out of focus.",
	},
	{
		slug: "sharp-puppy",
		fileName: "sharp-puppy.jpg",
		description:
			"Sharp, well-exposed portrait of a black puppy sitting on weathered wooden planks and looking up at the camera.",
	},
	{
		slug: "washed-out-shoreline",
		fileName: "washed-out-shoreline.jpg",
		description:
			"Hazy shoreline scene with rocks in the foreground, pale sky, and muted contrast across the water.",
	},
] as const satisfies ReadonlyArray<SeedDocumentInput>;

const seedLanguageSegmentationDocumentInputs = [
	{
		slug: "language-balloon-segmentation",
		fileName: "language-balloon.png",
		description:
			"Centered red balloon on a clean background used for the seeded language-prompted segmentation demo.",
	},
] as const satisfies ReadonlyArray<SeedDocumentInput>;

const seedSemanticSegmentationDocumentInputs = [
	{
		slug: "semantic-square-segmentation",
		fileName: "semantic-square.png",
		description:
			"Centered square-on-square composition used for the seeded semantic segmentation demo.",
	},
] as const satisfies ReadonlyArray<SeedDocumentInput>;

const seedConditionOCRDocumentInputs = [
	{
		slug: "ocr-urgent-notice",
		fileName: "ocr-urgent-notice.png",
		description:
			"Printed urgent warehouse notice with a bold red heading and short handling instructions.",
		ocrText: "URGENT\nDock 3 temperature alert\nInspect pallet 7 before 5 PM.",
		savedSummary:
			"Urgent warehouse notice calling out a temperature alert at Dock 3 and directing staff to inspect pallet 7 before 5 PM.",
	},
	{
		slug: "ocr-general-notice",
		fileName: "ocr-general-notice.png",
		description:
			"Routine schedule update posted on a clean blue-and-white operations sheet.",
		ocrText:
			"SCHEDULE UPDATE\nNext pickup window: Tuesday 10:30 AM\nBring badge and packing list.",
		savedSummary:
			"Routine schedule notice announcing the next pickup window on Tuesday at 10:30 AM and reminding staff to bring a badge and packing list.",
	},
] as const satisfies ReadonlyArray<SeedOCRDocumentInput>;

const seedSupervisorOCRDocumentInputs = [
	{
		slug: "ocr-invoice-review",
		fileName: "ocr-invoice-review.png",
		description:
			"Compact invoice layout with vendor, invoice number, total due, and due date.",
		ocrText:
			"INVOICE\nNorthwind Supply\nInvoice #1048\nTotal Due: $482.15\nDue Date: May 12",
		savedSummary:
			"Billing OCR review summarizing a Northwind Supply invoice numbered 1048 with a total due of $482.15 and a due date of May 12.",
		avgConfidence: 94,
	},
	{
		slug: "ocr-operations-review",
		fileName: "ocr-operations-review.png",
		description:
			"Operations memo listing an opening time, inspection task, and named shift lead.",
		ocrText:
			"OPERATIONS MEMO\nOpen lobby at 8:30 AM\nInspect cold storage seals\nShift lead: Maya Chen",
		savedSummary:
			"Operations OCR review highlighting a memo to open the lobby at 8:30 AM, inspect cold storage seals, and coordinate with shift lead Maya Chen.",
		avgConfidence: 89,
	},
] as const satisfies ReadonlyArray<SeedOCRDocumentInput>;

const semanticSegmentationInputSchema = {
	type: "object",
	properties: {
		image: { type: "string", description: "Input image" },
		output_json: { type: "boolean", default: true },
	},
	required: ["image"],
} as const;

const semanticSegmentationOutputSchema = {
	type: "object",
	title: "ModelOutput",
	properties: {
		img_out: { type: "string", format: "uri", title: "Img Out" },
		json_out: { type: "string", format: "uri", title: "Json Out" },
	},
	required: ["img_out"],
} as const;

const semanticSegmentationModelConfig = {
	input_image_field: "image",
	input_defaults: {
		output_json: true,
	},
	result_path: "json_out",
	result_source: "url_json",
	output_image_path: "img_out",
} as const;

const langSegmentationInputSchema = {
	type: "object",
	properties: {
		image: { type: "string", description: "Path to the input image" },
		text_prompt: {
			type: "string",
			description: "Text prompt for segmentation",
		},
	},
	required: ["image", "text_prompt"],
} as const;

const langSegmentationOutputSchema = {
	type: "string",
	format: "uri",
	title: "Output",
} as const;

const langSegmentationModelConfig = {
	input_image_field: "image",
	input_defaults: {},
	result_path: "$",
	result_source: "raw",
	output_image_path: "$",
} as const;

const deepseekOCRInputSchema = {
	type: "object",
	properties: {
		image: { type: "string", description: "Input image" },
		task_type: {
			type: "string",
			enum: ["General OCR", "Convert to Markdown", "Table OCR", "Formula OCR"],
		},
		reference_text: { type: "string" },
		resolution_size: {
			type: "string",
			enum: ["1024", "768", "1280"],
		},
	},
	required: ["image"],
} as const;

const deepseekOCROutputSchema = {
	type: "string",
} as const;

const deepseekOCRModelConfig = {
	input_image_field: "image",
	input_defaults: {
		task_type: "Convert to Markdown",
	},
	ocr_adapter: "deepseek_markdown",
} as const;

const dotsOCRInputSchema = {
	type: "object",
	properties: {
		image: { type: "string", description: "Input image" },
		return_confidence: { type: "boolean", default: true },
		confidence_threshold: { type: "number", default: 0.7 },
	},
	required: ["image"],
} as const;

const dotsOCROutputSchema = {
	type: "object",
	properties: {
		text: { type: "string" },
		avg_confidence: { type: "number" },
		low_confidence_count: { type: "number" },
		word_confidences: {
			type: "array",
			items: {
				type: "object",
				properties: {
					word: { type: "string" },
					confidence: { type: "number" },
				},
			},
		},
	},
} as const;

const dotsOCRModelConfig = {
	input_image_field: "image",
	input_defaults: {
		return_confidence: true,
		confidence_threshold: 0.7,
	},
	ocr_adapter: "dots_confidence",
} as const;

type UploadedSeedDocument = {
	slug: string;
	objectKey: string;
	contentType: string;
	eTag: string;
	sizeBytes: number;
	lastModifiedAt: Date;
	description: string;
};

const getSeedImageContentType = (fileName: string): string => {
	switch (extname(fileName).toLowerCase()) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		default:
			throw new Error(`Unsupported seed image extension: ${fileName}`);
	}
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
	inputs: ReadonlyArray<SeedDocumentInput>,
	pathPrefix: string,
): Promise<UploadedSeedDocument[]> => {
	return Promise.all(
		inputs.map(async (seedDocumentInput) => {
			const imageExtension = extname(seedDocumentInput.fileName).toLowerCase();
			if (imageExtension.length === 0) {
				throw new Error(
					`Seed image is missing an extension: ${seedDocumentInput.fileName}`,
				);
			}

			const sourceFile = Bun.file(
				new URL(`./seed-images/${seedDocumentInput.fileName}`, import.meta.url),
			);
			if (!(await sourceFile.exists())) {
				throw new Error(`Missing seed image: ${seedDocumentInput.fileName}`);
			}

			const sourceContentType =
				sourceFile.type.trim().toLowerCase() ||
				getSeedImageContentType(seedDocumentInput.fileName);
			const sourceImage = Buffer.from(await sourceFile.arrayBuffer());
			if (sourceImage.byteLength === 0) {
				throw new Error(`Seed image is empty: ${seedDocumentInput.fileName}`);
			}

			const objectKey = `${pathPrefix}/${seedDocumentInput.slug}${imageExtension}`;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function normalizeSeedNodeConfig(config: unknown) {
	if (!isPlainObject(config)) {
		return {};
	}

	const normalized = { ...config };
	delete normalized.uiPosition;
	return normalized;
}

function parseSeedCanvasPosition(config: unknown, fallbackIndex: number) {
	const fallback = {
		x: 80 + (fallbackIndex % 4) * 220,
		y: 80 + Math.floor(fallbackIndex / 4) * 140,
	};

	if (!isPlainObject(config) || !isPlainObject(config.uiPosition)) {
		return fallback;
	}

	const x = config.uiPosition.x;
	const y = config.uiPosition.y;

	return {
		x: typeof x === "number" ? Math.round(x) : fallback.x,
		y: typeof y === "number" ? Math.round(y) : fallback.y,
	};
}

const cloneWorkflowToTemplate = async (
	tx: SeedTransaction,
	input: {
		workflowId: string;
		organizationId?: string | null;
		visibility?: string;
	},
) => {
	const sourceWorkflow = await tx.query.agentGraphs.findFirst({
		where: (row, { eq }) => eq(row.id, input.workflowId),
		columns: {
			id: true,
			name: true,
			description: true,
			entryNode: true,
			stateSchema: true,
		},
		with: {
			agentGraphNodes: {
				columns: {
					id: true,
					nodeKey: true,
					nodeType: true,
					inputKey: true,
					outputKey: true,
					modelId: true,
					config: true,
				},
				with: {
					agentGraphNodeTools: {
						columns: {
							toolId: true,
						},
					},
				},
			},
			agentGraphEdges: {
				columns: {
					fromNode: true,
					toNode: true,
				},
			},
		},
	});

	if (!sourceWorkflow) {
		throw new Error(
			`Failed to load workflow ${input.workflowId} for template seeding`,
		);
	}

	const snapshot = {
		name: sourceWorkflow.name,
		description: sourceWorkflow.description,
		entryNode: sourceWorkflow.entryNode,
		stateSchema: isPlainObject(sourceWorkflow.stateSchema)
			? sourceWorkflow.stateSchema
			: null,
		nodes: sourceWorkflow.agentGraphNodes.map((node, index) => {
			const position = parseSeedCanvasPosition(node.config, index);
			return {
				nodeKey: node.nodeKey,
				nodeType: node.nodeType,
				x: position.x,
				y: position.y,
				inputKey: node.inputKey,
				outputKey: node.outputKey,
				modelId: node.modelId,
				toolIds: node.agentGraphNodeTools.map((toolLink) => toolLink.toolId),
				config: normalizeSeedNodeConfig(node.config),
			};
		}),
		edges: sourceWorkflow.agentGraphEdges.map((edge) => ({
			fromNode: edge.fromNode,
			toNode: edge.toNode,
		})),
	};

	const [template] = await tx
		.insert(agentGraphTemplates)
		.values({
			visibility: input.visibility ?? "organization",
			organizationId: input.organizationId ?? null,
		})
		.returning({
			id: agentGraphTemplates.id,
		});
	if (!template) {
		throw new Error(
			`Failed to create template for workflow ${sourceWorkflow.name}`,
		);
	}

	const [templateVersion] = await tx
		.insert(agentGraphTemplateVersions)
		.values({
			agentGraphTemplateId: template.id,
			version: 1,
			snapshot,
		})
		.returning({
			id: agentGraphTemplateVersions.id,
			version: agentGraphTemplateVersions.version,
		});

	if (!templateVersion) {
		throw new Error(
			`Failed to create template version for workflow ${sourceWorkflow.name}`,
		);
	}

	await tx
		.update(agentGraphTemplates)
		.set({
			currentVersionId: templateVersion.id,
		})
		.where(eq(agentGraphTemplates.id, template.id));

	await tx
		.update(agentGraphs)
		.set({
			agentGraphTemplateId: template.id,
			agentGraphTemplateVersionId: templateVersion.id,
		})
		.where(eq(agentGraphs.id, sourceWorkflow.id));

	return {
		id: template.id,
		name: sourceWorkflow.name,
		version: templateVersion.version,
		sourceWorkflowId: sourceWorkflow.id,
	};
};

const seed = async () => {
	const hashedPipelineApiKey = await hashApiKey(plainPipelineApiKey);
	const hashedQualityReviewApiKey = await hashApiKey(plainQualityReviewApiKey);
	const hashedSegmentationApiKey = await hashApiKey(plainSegmentationApiKey);
	const hashedSemanticSegmentationApiKey = await hashApiKey(
		plainSemanticSegmentationApiKey,
	);
	const hashedOCRConditionApiKey = await hashApiKey(plainOCRConditionApiKey);
	const hashedOCRSupervisorApiKey = await hashApiKey(plainOCRSupervisorApiKey);
	const hashedServiceApiKey = await hashApiKey(plainServiceApiKey);
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
	const uploadedLanguageSegmentationDocuments = await uploadSeedDocumentsToS3(
		s3Client,
		seedLanguageSegmentationDocumentInputs,
		"seed/language-segmentations",
	);
	const uploadedSemanticSegmentationDocuments = await uploadSeedDocumentsToS3(
		s3Client,
		seedSemanticSegmentationDocumentInputs,
		"seed/semantic-segmentations",
	);
	const uploadedConditionOCRDocuments = await uploadSeedDocumentsToS3(
		s3Client,
		seedConditionOCRDocumentInputs,
		"seed/ocr-condition",
	);
	const uploadedSupervisorOCRDocuments = await uploadSeedDocumentsToS3(
		s3Client,
		seedSupervisorOCRDocumentInputs,
		"seed/ocr-supervisor",
	);

	const result = await db.transaction(async (tx) => {
		await tx.execute(sql`
			TRUNCATE TABLE
				"agent_graph_run_steps",
				"agent_graph_runs",
				"agent_graph_template_versions",
				"agent_graph_templates",
				"agent_graph_edges",
				"agent_graph_node_tools",
				"agent_graph_nodes",
				"agent_graphs",
				"tools",
				"document_segmentations",
				"document_description_embeddings",
				"document_descriptions",
				"document_ocr_results",
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
				name: organizations.name,
				slug: organizations.slug,
			});
		if (!organization) throw new Error("Failed to create seed organization");

		const [secondaryOrganization] = await tx
			.insert(organizations)
			.values({
				name: "Seed Ventures",
				slug: "seed-ventures",
				createdAt: now,
			})
			.returning({
				id: organizations.id,
				name: organizations.name,
				slug: organizations.slug,
			});
		if (!secondaryOrganization) {
			throw new Error("Failed to create secondary seed organization");
		}

		await tx.insert(members).values([
			{
				organizationId: organization.id,
				userId: user.id,
				role: "owner",
				createdAt: now,
			},
			{
				organizationId: secondaryOrganization.id,
				userId: user.id,
				role: "owner",
				createdAt: now,
			},
		]);

		let seededLoginUser: {
			id: string;
			email: string;
		} | null = null;
		if (seededDashboardUserEmail && seededDashboardUserEmail !== user.email) {
			const [insertedSeededLoginUser] = await tx
				.insert(users)
				.values({
					name: "Seeded Dashboard User",
					email: seededDashboardUserEmail,
					emailVerified: true,
				})
				.returning({
					id: users.id,
					email: users.email,
				});
			if (!insertedSeededLoginUser) {
				throw new Error("Failed to create seeded dashboard login user");
			}

			await tx.insert(members).values([
				{
					organizationId: organization.id,
					userId: insertedSeededLoginUser.id,
					role: "owner",
					createdAt: now,
				},
				{
					organizationId: secondaryOrganization.id,
					userId: insertedSeededLoginUser.id,
					role: "owner",
					createdAt: now,
				},
			]);

			seededLoginUser = insertedSeededLoginUser;
		}

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
				name: projects.name,
				organizationId: projects.organizationId,
				slug: projects.slug,
			});
		if (!project) throw new Error("Failed to create seed project");

		const [secondaryProject] = await tx
			.insert(projects)
			.values({
				name: "Seed Ventures Project",
				slug: "seed-ventures-project",
				organizationId: secondaryOrganization.id,
			})
			.returning({
				id: projects.id,
				name: projects.name,
				organizationId: projects.organizationId,
				slug: projects.slug,
			});
		if (!secondaryProject) {
			throw new Error("Failed to create secondary seed project");
		}

		// ── Models ──

		const [clipModel] = await tx
			.insert(models)
			.values({
				provider: "REPLICATE",
				name: "openai/clip",
				version: "",
				type: "embedding",
				embeddingDim: 768,
				config: {},
			})
			.returning({ id: models.id });
		if (!clipModel) throw new Error("Failed to create CLIP model");

		const [gpt41MiniModel] = await tx
			.insert(models)
			.values({
				provider: "OPENAI",
				name: "gpt-4.1-mini",
				version: "",
				type: "chat",
				config: {},
			})
			.returning({ id: models.id });
		if (!gpt41MiniModel) throw new Error("Failed to create GPT-4.1-mini model");

		const [semanticSegmentationModel] = await tx
			.insert(models)
			.values({
				provider: "REPLICATE",
				name: "cjwbw/semantic-segment-anything",
				version: semanticSegmentAnythingVersion,
				type: "segmentation",
				inputSchema: semanticSegmentationInputSchema,
				outputSchema: semanticSegmentationOutputSchema,
				config: semanticSegmentationModelConfig,
			})
			.returning({ id: models.id });
		if (!semanticSegmentationModel) {
			throw new Error("Failed to create semantic segmentation model");
		}

		const [langSegmentationModel] = await tx
			.insert(models)
			.values({
				provider: "REPLICATE",
				name: "tmappdev/lang-segment-anything",
				version: langSegmentAnythingVersion,
				type: "segmentation",
				inputSchema: langSegmentationInputSchema,
				outputSchema: langSegmentationOutputSchema,
				config: langSegmentationModelConfig,
			})
			.returning({ id: models.id });
		if (!langSegmentationModel) {
			throw new Error("Failed to create language segmentation model");
		}

		const [deepseekOCRModel] = await tx
			.insert(models)
			.values({
				provider: "REPLICATE",
				name: "lucataco/deepseek-ocr",
				version: deepseekOCRVersion,
				type: "ocr",
				inputSchema: deepseekOCRInputSchema,
				outputSchema: deepseekOCROutputSchema,
				config: deepseekOCRModelConfig,
			})
			.returning({ id: models.id });
		if (!deepseekOCRModel) {
			throw new Error("Failed to create DeepSeek OCR model");
		}

		const [dotsOCRModel] = await tx
			.insert(models)
			.values({
				provider: "REPLICATE",
				name: "mind-ware/dots-ocr-with-confidence",
				version: dotsOCRVersion,
				type: "ocr",
				inputSchema: dotsOCRInputSchema,
				outputSchema: dotsOCROutputSchema,
				config: dotsOCRModelConfig,
			})
			.returning({ id: models.id });
		if (!dotsOCRModel) {
			throw new Error("Failed to create DOTS OCR model");
		}

		// ── Tools ──

		const [createDocDescTool] = await tx
			.insert(tools)
			.values({
				name: "create_document_description",
				description: "Save an LLM-generated text description for a document.",
				inputSchema: {
					type: "object",
					properties: {
						document_id: { type: "string" },
						text: { type: "string" },
						model_provider: { type: "string" },
						model_name: { type: "string" },
						model_version: { type: "string" },
					},
					required: [
						"document_id",
						"text",
						"model_provider",
						"model_name",
						"model_version",
					],
				},
				outputSchema: {
					type: "object",
					properties: {
						description_id: { type: "string" },
						text: { type: "string" },
					},
				},
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
				inputSchema: {
					type: "object",
					properties: {
						document_id: { type: "string" },
						temp_url: { type: "string" },
					},
					required: ["document_id", "temp_url"],
				},
				outputSchema: {
					type: "object",
					properties: {
						embedding_id: { type: "string" },
					},
				},
			})
			.returning({ id: tools.id });
		if (!createDocEmbTool)
			throw new Error("Failed to create create_document_embedding tool");

		const [createDocSegTool] = await tx
			.insert(tools)
			.values({
				name: "create_document_segmentation",
				description:
					"Generate a document segmentation, persist the result payload, and store any derived segmented image as a document.",
				inputSchema: {
					type: "object",
					properties: {
						document_id: { type: "string" },
						temp_url: { type: "string" },
						model_provider: { type: "string" },
						model_name: { type: "string" },
						model_version: { type: "string" },
						input_params: { type: "object" },
					},
					required: [
						"document_id",
						"temp_url",
						"model_provider",
						"model_name",
						"model_version",
					],
				},
				outputSchema: {
					type: "object",
					properties: {
						segmentation_id: { type: "string" },
						segmented_document_id: {
							type: ["string", "null"],
						},
						segmented_temp_url: {
							type: ["string", "null"],
						},
						result: {},
					},
				},
			})
			.returning({ id: tools.id });
		if (!createDocSegTool)
			throw new Error("Failed to create create_document_segmentation tool");

		const [createDocOCRTool] = await tx
			.insert(tools)
			.values({
				name: "create_document_ocr",
				description:
					"Generate OCR text with a versioned model, normalize the result, and persist it for a document.",
				inputSchema: {
					type: "object",
					properties: {
						document_id: { type: "string" },
						temp_url: { type: "string" },
						model_provider: { type: "string" },
						model_name: { type: "string" },
						model_version: { type: "string" },
						input_params: { type: "object" },
					},
					required: [
						"document_id",
						"temp_url",
						"model_provider",
						"model_name",
						"model_version",
					],
				},
				outputSchema: {
					type: "object",
					properties: {
						ocr_result_id: { type: "string" },
						text: { type: "string" },
						avg_confidence: {
							type: ["number", "null"],
						},
						result: {},
					},
				},
			})
			.returning({ id: tools.id });
		if (!createDocOCRTool)
			throw new Error("Failed to create create_document_ocr tool");

		const [createDescEmbTool] = await tx
			.insert(tools)
			.values({
				name: "create_description_embedding",
				description:
					"Generate a CLIP text embedding for a document description and save it to the database.",
				inputSchema: {
					type: "object",
					properties: {
						document_description_id: { type: "string" },
						text: { type: "string" },
					},
					required: ["document_description_id", "text"],
				},
				outputSchema: {
					type: "object",
					properties: {
						embedding_id: { type: "string" },
					},
				},
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
				inputSchema: {
					type: "object",
					properties: {
						document_id: { type: "string" },
					},
					required: ["document_id"],
				},
				outputSchema: {
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
				},
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
				inputSchema: {
					type: "object",
					properties: {
						document_description_id: { type: "string" },
					},
					required: ["document_description_id"],
				},
				outputSchema: {
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
				},
			})
			.returning({ id: tools.id });
		if (!findSimilarDescsTool)
			throw new Error("Failed to create find_similar_descriptions tool");

		// ── Agent Graph (workflow 0: remote sensing scene review) ──

		const [remoteSensingGraph] = await tx
			.insert(agentGraphs)
			.values({
				id: seededRemoteSensingWorkflowId,
				name: "Remote Sensing Scene Review",
				description:
					"Reviews an Earth-observation scene for data center construction and power infrastructure, saves a concise analysis, and embeds the written review for retrieval.",
				entryNode: "review_scene",
				organizationId: organization.id,
			})
			.returning({ id: agentGraphs.id });
		if (!remoteSensingGraph) {
			throw new Error("Failed to create remote sensing agent graph");
		}

		const [reviewSceneNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "review_scene",
				nodeType: "worker",
				inputKey: "temp_url",
				outputKey: "scene_review",
				config: {
					system_message:
						"You analyze Earth-observation imagery for data center construction and related infrastructure. Review visible land clearing, grading, access roads, concrete pads, structural shells, roofing progress, cooling yards, substations, transmission tie-ins, staging areas, parking, and any obvious anomalies. Return a short caption-style plain-text review grounded only in what is visible. Use 1 sentence, never exceed 35 words or 240 characters, and avoid markdown or unsupported inference.",
					max_iterations: 3,
					input_mode: "image_url",
					input_prompt:
						"Review this satellite scene in exactly 1 sentence with at most 35 words and 240 characters. Focus on the most important visible data center construction and related utility signals. Keep it factual, caption-like, and avoid markdown.",
				},
				agentGraphId: remoteSensingGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!reviewSceneNode) {
			throw new Error("Failed to create review_scene node");
		}

		const [saveSceneReviewNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "save_scene_review",
				nodeType: "tool",
				config: {
					input_mapping: {
						text: "scene_review",
						model_provider: "_const:OPENAI",
						model_name: "_const:gpt-4.1-mini",
						model_version: "_const:",
					},
					output_mapping: {
						description_id: "document_description_id",
					},
				},
				agentGraphId: remoteSensingGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!saveSceneReviewNode) {
			throw new Error("Failed to create save_scene_review node");
		}

		const [embedSceneReviewNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "embed_scene_review",
				nodeType: "tool",
				config: {
					input_mapping: {
						text: "scene_review",
						document_description_id: "document_description_id",
					},
				},
				agentGraphId: remoteSensingGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!embedSceneReviewNode) {
			throw new Error("Failed to create embed_scene_review node");
		}

		await tx.insert(agentGraphNodeTools).values([
			{
				agentGraphNodeId: saveSceneReviewNode.id,
				toolId: createDocDescTool.id,
			},
			{
				agentGraphNodeId: embedSceneReviewNode.id,
				toolId: createDescEmbTool.id,
			},
		]);

		await tx.insert(agentGraphEdges).values([
			{
				fromNode: "review_scene",
				toNode: "save_scene_review",
				agentGraphId: remoteSensingGraph.id,
			},
			{
				fromNode: "save_scene_review",
				toNode: "embed_scene_review",
				agentGraphId: remoteSensingGraph.id,
			},
			{
				fromNode: "embed_scene_review",
				toNode: "END",
				agentGraphId: remoteSensingGraph.id,
			},
		]);

		const [serviceApiKey] = await tx
			.insert(apikeys)
			.values({
				name: "Seed Service API Key",
				start: plainServiceApiKey.slice(0, 6),
				prefix: "seed",
				key: hashedServiceApiKey,
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				kind: "service",
				deviceId: null,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10_000,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: serviceAPIKeyPermissionsJSON,
				metadata: JSON.stringify({
					source: "seed.ts",
					role: "service",
				}),
			})
			.returning({
				id: apikeys.id,
			});
		if (!serviceApiKey) {
			throw new Error("Failed to create seed service API key");
		}

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
				config: {
					system_message:
						"You are a document analysis assistant. Given an image URL of a document, return one concise plain-text paragraph describing key contents, layout, and any visible text. Keep the output to 50 words max (about 320 characters), and do not include markdown, bullet points, or URLs.",
					max_iterations: 3,
					input_mode: "image_url",
					input_prompt:
						"Describe this document image in one concise paragraph (max 50 words). Focus on layout, key text, and visual elements.",
				},
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
				config: {
					input_mapping: {
						text: "description",
						model_provider: "_const:OPENAI",
						model_name: "_const:gpt-4.1-mini",
						model_version: "_const:",
					},
					output_mapping: {
						description_id: "document_description_id",
					},
				},
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
				config: {},
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
				config: {
					input_mapping: {
						text: "description",
						document_description_id: "document_description_id",
					},
				},
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
				config: {},
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
				config: {},
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
				kind: "device",
				deviceId: pipelineDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: deviceAPIKeyPermissionsJSON,
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
				config: {
					system_message:
						"You are the GOOD image-quality specialist. Use this route only when the image quality is acceptable for downstream document analysis. Given an image URL, explain in detail why the image is good enough. Cover sharpness/focus, exposure and contrast, framing/cropping, legibility of text, noise/compression artifacts, and whether the full document content appears captured. Mention minor flaws if present, but keep the final judgment clearly positive. End with a one-line verdict that starts with 'Verdict: GOOD'.",
					max_iterations: 4,
				},
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
				config: {
					system_message:
						"You are the BAD image-quality specialist. Use this route only when the image quality is not acceptable for downstream document analysis. Given an image URL, explain in detail why the image is bad. Be specific about failure points such as blur, motion blur, poor exposure, glare, cropping, skew/perspective distortion, low resolution, illegible text, and compression artifacts. Include concrete remediation steps so the user can retake the image successfully. End with a one-line verdict that starts with 'Verdict: BAD'.",
					max_iterations: 4,
				},
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
				config: {
					members: ["image_quality_good_worker", "image_quality_bad_worker"],
					input_mode: "image_url",
					input_prompt:
						"Route this image to exactly one specialist based on quality. After that specialist responds, finish.",
					max_iterations: 10,
				},
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
				kind: "device",
				deviceId: qualityReviewDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: deviceAPIKeyPermissionsJSON,
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

		// ── Example Agent Graph Runs (quality review supervisor workflow) ──

		const runBaseTime = new Date(now.getTime() - 1000 * 60 * 10); // 10 min ago

		// Run 1: sharp-puppy → routed to GOOD worker (completed)
		const goodRunStarted = new Date(runBaseTime.getTime());
		const goodRunFinished = new Date(runBaseTime.getTime() + 1000 * 12); // 12s

		const sharpPuppyDoc = qrSeedDocumentsWithIds.find(
			(d) => d.slug === "sharp-puppy",
		);
		if (!sharpPuppyDoc)
			throw new Error("Failed to find sharp-puppy seed document");

		const [goodRun] = await tx
			.insert(agentGraphRuns)
			.values({
				agentGraphId: qualityReviewGraph.id,
				status: "completed",
				initialState: {
					temp_url: `https://s3.example.com/${sharpPuppyDoc.objectKey}`,
					document_id: sharpPuppyDoc.documentId,
				},
				finalState: {
					temp_url: `https://s3.example.com/${sharpPuppyDoc.objectKey}`,
					document_id: sharpPuppyDoc.documentId,
					quality_review:
						"The puppy portrait is sharp and evenly exposed with crisp fur detail around the face and clear catchlights in the eyes. Subject separation is strong, framing is intentional, and the wooden background adds texture without distracting from the subject. Minor vignette styling is present but does not reduce readability of the main subject. Verdict: GOOD",
					routed_to: "image_quality_good_worker",
				},
				startedAt: goodRunStarted,
				finishedAt: goodRunFinished,
			})
			.returning({ id: agentGraphRuns.id });
		if (!goodRun) throw new Error("Failed to create good quality run");

		await tx.insert(agentGraphRunSteps).values([
			{
				runId: goodRun.id,
				nodeKey: "quality_review_supervisor",
				stepOrder: 1,
				stateDelta: {
					routing_decision: "image_quality_good_worker",
					reasoning:
						"Image is sharp, well-exposed, and clearly framed. Routing to good-quality specialist.",
				},
				startedAt: new Date(goodRunStarted.getTime()),
				finishedAt: new Date(goodRunStarted.getTime() + 1000 * 3),
			},
			{
				runId: goodRun.id,
				nodeKey: "image_quality_good_worker",
				stepOrder: 2,
				stateDelta: {
					quality_review:
						"The puppy portrait is sharp and evenly exposed with crisp fur detail around the face and clear catchlights in the eyes. Subject separation is strong, framing is intentional, and the wooden background adds texture without distracting from the subject. Minor vignette styling is present but does not reduce readability of the main subject. Verdict: GOOD",
				},
				startedAt: new Date(goodRunStarted.getTime() + 1000 * 3),
				finishedAt: new Date(goodRunStarted.getTime() + 1000 * 9),
			},
			{
				runId: goodRun.id,
				nodeKey: "quality_review_supervisor",
				stepOrder: 3,
				stateDelta: {
					decision: "FINISH",
					routed_to: "image_quality_good_worker",
				},
				startedAt: new Date(goodRunStarted.getTime() + 1000 * 9),
				finishedAt: new Date(goodRunStarted.getTime() + 1000 * 12),
			},
		]);

		// Run 2: soft-focus-cat → routed to BAD worker (completed)
		const badRunStarted = new Date(runBaseTime.getTime() + 1000 * 30);
		const badRunFinished = new Date(badRunStarted.getTime() + 1000 * 14);

		const softFocusCatDoc = qrSeedDocumentsWithIds.find(
			(d) => d.slug === "soft-focus-cat",
		);
		if (!softFocusCatDoc)
			throw new Error("Failed to find soft-focus-cat seed document");

		const [badRun] = await tx
			.insert(agentGraphRuns)
			.values({
				agentGraphId: qualityReviewGraph.id,
				status: "completed",
				initialState: {
					temp_url: `https://s3.example.com/${softFocusCatDoc.objectKey}`,
					document_id: softFocusCatDoc.documentId,
				},
				finalState: {
					temp_url: `https://s3.example.com/${softFocusCatDoc.objectKey}`,
					document_id: softFocusCatDoc.documentId,
					quality_review:
						"The cat close-up uses such a shallow depth of field that only the nose is sharply rendered while the rest of the frame falls off into blur. That makes the subject poorly documented for review or downstream extraction tasks. Remediation: step back slightly, increase depth of field, and ensure the full face stays in focus before capture. Verdict: BAD",
					routed_to: "image_quality_bad_worker",
				},
				startedAt: badRunStarted,
				finishedAt: badRunFinished,
			})
			.returning({ id: agentGraphRuns.id });
		if (!badRun) throw new Error("Failed to create bad quality run");

		await tx.insert(agentGraphRunSteps).values([
			{
				runId: badRun.id,
				nodeKey: "quality_review_supervisor",
				stepOrder: 1,
				stateDelta: {
					routing_decision: "image_quality_bad_worker",
					reasoning:
						"Image has severe focus falloff and poor overall subject coverage. Routing to bad-quality specialist.",
				},
				startedAt: new Date(badRunStarted.getTime()),
				finishedAt: new Date(badRunStarted.getTime() + 1000 * 3),
			},
			{
				runId: badRun.id,
				nodeKey: "image_quality_bad_worker",
				stepOrder: 2,
				stateDelta: {
					quality_review:
						"The cat close-up uses such a shallow depth of field that only the nose is sharply rendered while the rest of the frame falls off into blur. That makes the subject poorly documented for review or downstream extraction tasks. Remediation: step back slightly, increase depth of field, and ensure the full face stays in focus before capture. Verdict: BAD",
				},
				startedAt: new Date(badRunStarted.getTime() + 1000 * 3),
				finishedAt: new Date(badRunStarted.getTime() + 1000 * 11),
			},
			{
				runId: badRun.id,
				nodeKey: "quality_review_supervisor",
				stepOrder: 3,
				stateDelta: {
					decision: "FINISH",
					routed_to: "image_quality_bad_worker",
				},
				startedAt: new Date(badRunStarted.getTime() + 1000 * 11),
				finishedAt: new Date(badRunStarted.getTime() + 1000 * 14),
			},
		]);

		// Run 3: washed-out-shoreline → routed to BAD worker (completed)
		const washedOutRunStarted = new Date(runBaseTime.getTime() + 1000 * 60);
		const washedOutRunFinished = new Date(
			washedOutRunStarted.getTime() + 1000 * 15,
		);

		const washedOutShorelineDoc = qrSeedDocumentsWithIds.find(
			(d) => d.slug === "washed-out-shoreline",
		);
		if (!washedOutShorelineDoc)
			throw new Error("Failed to find washed-out-shoreline seed document");

		const [washedOutRun] = await tx
			.insert(agentGraphRuns)
			.values({
				agentGraphId: qualityReviewGraph.id,
				status: "completed",
				initialState: {
					temp_url: `https://s3.example.com/${washedOutShorelineDoc.objectKey}`,
					document_id: washedOutShorelineDoc.documentId,
				},
				finalState: {
					temp_url: `https://s3.example.com/${washedOutShorelineDoc.objectKey}`,
					document_id: washedOutShorelineDoc.documentId,
					quality_review:
						"The shoreline image is washed out by haze and flat lighting, leaving weak separation between the rocks, water, and sky. Fine detail is muted and the overall scene lacks the contrast needed for reliable visual inspection. Remediation: retake in clearer light, reduce overexposure, and increase local contrast so subject boundaries remain distinct. Verdict: BAD",
					routed_to: "image_quality_bad_worker",
				},
				startedAt: washedOutRunStarted,
				finishedAt: washedOutRunFinished,
			})
			.returning({ id: agentGraphRuns.id });
		if (!washedOutRun)
			throw new Error("Failed to create washed-out shoreline run");

		await tx.insert(agentGraphRunSteps).values([
			{
				runId: washedOutRun.id,
				nodeKey: "quality_review_supervisor",
				stepOrder: 1,
				stateDelta: {
					routing_decision: "image_quality_bad_worker",
					reasoning:
						"Image has low contrast, muted detail, and weak subject separation. Routing to bad-quality specialist.",
				},
				startedAt: new Date(washedOutRunStarted.getTime()),
				finishedAt: new Date(washedOutRunStarted.getTime() + 1000 * 4),
			},
			{
				runId: washedOutRun.id,
				nodeKey: "image_quality_bad_worker",
				stepOrder: 2,
				stateDelta: {
					quality_review:
						"The shoreline image is washed out by haze and flat lighting, leaving weak separation between the rocks, water, and sky. Fine detail is muted and the overall scene lacks the contrast needed for reliable visual inspection. Remediation: retake in clearer light, reduce overexposure, and increase local contrast so subject boundaries remain distinct. Verdict: BAD",
				},
				startedAt: new Date(washedOutRunStarted.getTime() + 1000 * 4),
				finishedAt: new Date(washedOutRunStarted.getTime() + 1000 * 12),
			},
			{
				runId: washedOutRun.id,
				nodeKey: "quality_review_supervisor",
				stepOrder: 3,
				stateDelta: {
					decision: "FINISH",
					routed_to: "image_quality_bad_worker",
				},
				startedAt: new Date(washedOutRunStarted.getTime() + 1000 * 12),
				finishedAt: new Date(washedOutRunStarted.getTime() + 1000 * 15),
			},
		]);

		// ── Agent Graph (workflow 3: language-prompted segmentation) ──

		const [segmentationGraph] = await tx
			.insert(agentGraphs)
			.values({
				name: "Document Segmentation Showcase",
				description:
					"Generates a short prompt from the image, runs prompt-based segmentation, and summarizes the derived output.",
				entryNode: "suggest_segment_prompt",
				organizationId: organization.id,
			})
			.returning({ id: agentGraphs.id });
		if (!segmentationGraph) {
			throw new Error("Failed to create segmentation agent graph");
		}

		const [suggestSegmentPromptNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "suggest_segment_prompt",
				nodeType: "worker",
				inputKey: "temp_url",
				outputKey: "segmentation_prompt",
				config: {
					system_message:
						"You create short segmentation prompts from images. Return only the most important visible subject as a concise noun phrase of one to four words. Do not add punctuation, explanations, or multiple options.",
					max_iterations: 2,
					input_mode: "image_url",
					input_prompt:
						"Look at this image and return the single best subject to segment as a short noun phrase.",
				},
				agentGraphId: segmentationGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!suggestSegmentPromptNode) {
			throw new Error("Failed to create suggest_segment_prompt node");
		}

		const [langSegmentNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "lang_segment",
				nodeType: "tool",
				config: {
					input_mapping: {
						model_provider: "_const:REPLICATE",
						model_name: "_const:tmappdev/lang-segment-anything",
						model_version: `_const:${langSegmentAnythingVersion}`,
						input_params: {
							text_prompt: "segmentation_prompt",
						},
					},
					output_mapping: {
						segmentation_id: "lang_segmentation_id",
						segmented_document_id: "lang_segmented_document_id",
						segmented_temp_url: "lang_segmented_temp_url",
						result: "lang_segmentation_result",
					},
				},
				agentGraphId: segmentationGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!langSegmentNode) {
			throw new Error("Failed to create lang_segment node");
		}

		const [describeLangNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "describe_lang_segment",
				nodeType: "worker",
				inputKey: "lang_segmented_temp_url",
				outputKey: "lang_segment_summary",
				config: {
					system_message:
						"You are a segmentation analyst. Given a prompt-driven segmented image, explain what object the mask appears to isolate and whether the result is plausible. Keep the response to one concise paragraph.",
					max_iterations: 3,
					input_mode: "image_url",
					input_prompt:
						"Describe the prompt-driven segmentation result and the object it isolates.",
				},
				agentGraphId: segmentationGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!describeLangNode) {
			throw new Error("Failed to create describe_lang_segment node");
		}

		await tx.insert(agentGraphNodeTools).values([
			{
				agentGraphNodeId: langSegmentNode.id,
				toolId: createDocSegTool.id,
			},
		]);

		await tx.insert(agentGraphEdges).values([
			{
				fromNode: "suggest_segment_prompt",
				toNode: "lang_segment",
				agentGraphId: segmentationGraph.id,
			},
			{
				fromNode: "lang_segment",
				toNode: "describe_lang_segment",
				agentGraphId: segmentationGraph.id,
			},
			{
				fromNode: "describe_lang_segment",
				toNode: "END",
				agentGraphId: segmentationGraph.id,
			},
		]);

		const [segmentationDevice] = await tx
			.insert(devices)
			.values({
				name: "Seed Segmentation Device",
				slug: "seed-segmentation-device",
				organizationId: organization.id,
				projectId: project.id,
				agentGraphId: segmentationGraph.id,
			})
			.returning({
				id: devices.id,
				slug: devices.slug,
			});
		if (!segmentationDevice) {
			throw new Error("Failed to create segmentation device");
		}

		const [segmentationApiKey] = await tx
			.insert(apikeys)
			.values({
				name: "Seed Segmentation Device API Key",
				start: plainSegmentationApiKey.slice(0, 6),
				prefix: "seed",
				key: hashedSegmentationApiKey,
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				kind: "device",
				deviceId: segmentationDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: deviceAPIKeyPermissionsJSON,
				metadata: JSON.stringify({
					source: "seed.ts",
					workflow: "segmentation-showcase",
				}),
			})
			.returning({
				id: apikeys.id,
			});
		if (!segmentationApiKey) {
			throw new Error("Failed to create segmentation API key");
		}

		const insertedSegmentationDocuments = await tx
			.insert(documents)
			.values(
				uploadedLanguageSegmentationDocuments.map((seedDocument) => ({
					bucket,
					objectKey: seedDocument.objectKey,
					contentType: seedDocument.contentType,
					eTag: seedDocument.eTag,
					sizeBytes: seedDocument.sizeBytes,
					lastModifiedAt: seedDocument.lastModifiedAt,
					visibility: "org",
					organizationId: organization.id,
					projectId: project.id,
					deviceId: segmentationDevice.id,
				})),
			)
			.returning({
				id: documents.id,
				objectKey: documents.objectKey,
			});
		if (
			insertedSegmentationDocuments.length !==
			uploadedLanguageSegmentationDocuments.length
		) {
			throw new Error("Failed to insert segmentation seed documents");
		}

		const segmentationDocumentIdByObjectKey = new Map(
			insertedSegmentationDocuments.map((document) => [
				document.objectKey,
				document.id,
			]),
		);

		const segmentationSeedDocumentsWithIds =
			uploadedLanguageSegmentationDocuments.map((seedDocument) => {
				const documentId = segmentationDocumentIdByObjectKey.get(
					seedDocument.objectKey,
				);
				if (!documentId) {
					throw new Error(
						`Failed to resolve segmentation document id for ${seedDocument.objectKey}`,
					);
				}

				return {
					...seedDocument,
					documentId,
				};
			});

		// ── Agent Graph (workflow 4: semantic segmentation) ──

		const [semanticSegmentationGraph] = await tx
			.insert(agentGraphs)
			.values({
				name: "Semantic Document Segmentation Showcase",
				description:
					"Runs semantic segmentation on an image and summarizes the derived segmented output.",
				entryNode: "semantic_segment",
				organizationId: organization.id,
			})
			.returning({ id: agentGraphs.id });
		if (!semanticSegmentationGraph) {
			throw new Error("Failed to create semantic segmentation agent graph");
		}

		const [semanticSegmentNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "semantic_segment",
				nodeType: "tool",
				config: {
					input_mapping: {
						model_provider: "_const:REPLICATE",
						model_name: "_const:cjwbw/semantic-segment-anything",
						model_version: `_const:${semanticSegmentAnythingVersion}`,
						input_params: {
							output_json: true,
						},
					},
					output_mapping: {
						segmentation_id: "semantic_segmentation_id",
						segmented_document_id: "semantic_segmented_document_id",
						segmented_temp_url: "semantic_segmented_temp_url",
						result: "semantic_segmentation_result",
					},
				},
				agentGraphId: semanticSegmentationGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!semanticSegmentNode) {
			throw new Error("Failed to create semantic_segment node");
		}

		const [describeSemanticSegmentNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "describe_semantic_segment",
				nodeType: "worker",
				inputKey: "semantic_segmented_temp_url",
				outputKey: "semantic_segment_summary",
				config: {
					system_message:
						"You are a segmentation analyst. Given a semantically segmented image, explain what regions or boundaries the mask appears to capture and whether the output looks coherent. Keep the response to one concise paragraph.",
					max_iterations: 3,
					input_mode: "image_url",
					input_prompt:
						"Describe the semantic segmentation result and the scene regions it appears to isolate.",
				},
				agentGraphId: semanticSegmentationGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!describeSemanticSegmentNode) {
			throw new Error("Failed to create describe_semantic_segment node");
		}

		await tx.insert(agentGraphNodeTools).values([
			{
				agentGraphNodeId: semanticSegmentNode.id,
				toolId: createDocSegTool.id,
			},
		]);

		await tx.insert(agentGraphEdges).values([
			{
				fromNode: "semantic_segment",
				toNode: "describe_semantic_segment",
				agentGraphId: semanticSegmentationGraph.id,
			},
			{
				fromNode: "describe_semantic_segment",
				toNode: "END",
				agentGraphId: semanticSegmentationGraph.id,
			},
		]);

		const [semanticSegmentationDevice] = await tx
			.insert(devices)
			.values({
				name: "Seed Semantic Segmentation Device",
				slug: "seed-semantic-segmentation-device",
				organizationId: organization.id,
				projectId: project.id,
				agentGraphId: semanticSegmentationGraph.id,
			})
			.returning({
				id: devices.id,
				slug: devices.slug,
			});
		if (!semanticSegmentationDevice) {
			throw new Error("Failed to create semantic segmentation device");
		}

		const [semanticSegmentationApiKey] = await tx
			.insert(apikeys)
			.values({
				name: "Seed Semantic Segmentation Device API Key",
				start: plainSemanticSegmentationApiKey.slice(0, 6),
				prefix: "seed",
				key: hashedSemanticSegmentationApiKey,
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				kind: "device",
				deviceId: semanticSegmentationDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: deviceAPIKeyPermissionsJSON,
				metadata: JSON.stringify({
					source: "seed.ts",
					workflow: "semantic-segmentation-showcase",
				}),
			})
			.returning({
				id: apikeys.id,
			});
		if (!semanticSegmentationApiKey) {
			throw new Error("Failed to create semantic segmentation API key");
		}

		const insertedSemanticSegmentationDocuments = await tx
			.insert(documents)
			.values(
				uploadedSemanticSegmentationDocuments.map((seedDocument) => ({
					bucket,
					objectKey: seedDocument.objectKey,
					contentType: seedDocument.contentType,
					eTag: seedDocument.eTag,
					sizeBytes: seedDocument.sizeBytes,
					lastModifiedAt: seedDocument.lastModifiedAt,
					visibility: "org",
					organizationId: organization.id,
					projectId: project.id,
					deviceId: semanticSegmentationDevice.id,
				})),
			)
			.returning({
				id: documents.id,
				objectKey: documents.objectKey,
			});
		if (
			insertedSemanticSegmentationDocuments.length !==
			uploadedSemanticSegmentationDocuments.length
		) {
			throw new Error("Failed to insert semantic segmentation seed documents");
		}

		const semanticSegmentationDocumentIdByObjectKey = new Map(
			insertedSemanticSegmentationDocuments.map((document) => [
				document.objectKey,
				document.id,
			]),
		);

		const semanticSegmentationSeedDocumentsWithIds =
			uploadedSemanticSegmentationDocuments.map((seedDocument) => {
				const documentId = semanticSegmentationDocumentIdByObjectKey.get(
					seedDocument.objectKey,
				);
				if (!documentId) {
					throw new Error(
						`Failed to resolve semantic segmentation document id for ${seedDocument.objectKey}`,
					);
				}

				return {
					...seedDocument,
					documentId,
				};
			});

		// ── Agent Graph (workflow 5: deterministic OCR keyword routing) ──

		const [ocrConditionGraph] = await tx
			.insert(agentGraphs)
			.values({
				name: "OCR Keyword Condition Router",
				description:
					"Extracts OCR text, branches deterministically on keywords, and saves a specialist summary.",
				entryNode: "extract_ocr",
				organizationId: organization.id,
			})
			.returning({ id: agentGraphs.id });
		if (!ocrConditionGraph) {
			throw new Error("Failed to create OCR condition graph");
		}

		const [extractOCRNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "extract_ocr",
				nodeType: "tool",
				config: {
					input_mapping: {
						model_provider: "_const:REPLICATE",
						model_name: "_const:lucataco/deepseek-ocr",
						model_version: `_const:${deepseekOCRVersion}`,
						input_params: {
							task_type: "_const:Convert to Markdown",
						},
					},
					output_mapping: {
						ocr_result_id: "ocr_result_id",
						text: "ocr_text",
						result: "ocr_raw_result",
					},
				},
				agentGraphId: ocrConditionGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!extractOCRNode) {
			throw new Error("Failed to create extract_ocr node");
		}

		const [routeKeywordNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "route_keyword",
				nodeType: "condition",
				outputKey: "contains_urgent",
				config: {
					source_key: "ocr_text",
					operator: "contains",
					value: "URGENT",
					case_sensitive: false,
					true_target: "urgent_notice_specialist",
					false_target: "general_notice_specialist",
				},
				agentGraphId: ocrConditionGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!routeKeywordNode) {
			throw new Error("Failed to create route_keyword node");
		}

		const [urgentNoticeSpecialistNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "urgent_notice_specialist",
				nodeType: "worker",
				inputKey: "ocr_text",
				outputKey: "notice_summary",
				config: {
					system_message:
						"You review OCR text for urgent operational notices. Summarize the alert, the action required, and the deadline in one concise paragraph.",
					max_iterations: 3,
					input_prompt:
						"Summarize why this OCR result should be treated as urgent and what action it requires.",
				},
				agentGraphId: ocrConditionGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!urgentNoticeSpecialistNode) {
			throw new Error("Failed to create urgent_notice_specialist node");
		}

		const [generalNoticeSpecialistNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "general_notice_specialist",
				nodeType: "worker",
				inputKey: "ocr_text",
				outputKey: "notice_summary",
				config: {
					system_message:
						"You review OCR text for routine notices. Summarize the main schedule or instruction in one concise paragraph without escalating urgency.",
					max_iterations: 3,
					input_prompt:
						"Summarize the routine notice and the main instruction from this OCR result.",
				},
				agentGraphId: ocrConditionGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!generalNoticeSpecialistNode) {
			throw new Error("Failed to create general_notice_specialist node");
		}

		const [saveNoticeSummaryNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "save_notice_summary",
				nodeType: "tool",
				config: {
					input_mapping: {
						text: "notice_summary",
						model_provider: "_const:OPENAI",
						model_name: "_const:gpt-4.1-mini",
						model_version: "_const:",
					},
				},
				agentGraphId: ocrConditionGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!saveNoticeSummaryNode) {
			throw new Error("Failed to create save_notice_summary node");
		}

		await tx.insert(agentGraphNodeTools).values([
			{
				agentGraphNodeId: extractOCRNode.id,
				toolId: createDocOCRTool.id,
			},
			{
				agentGraphNodeId: saveNoticeSummaryNode.id,
				toolId: createDocDescTool.id,
			},
		]);

		await tx.insert(agentGraphEdges).values([
			{
				fromNode: "extract_ocr",
				toNode: "route_keyword",
				agentGraphId: ocrConditionGraph.id,
			},
			{
				fromNode: "route_keyword",
				toNode: "urgent_notice_specialist",
				agentGraphId: ocrConditionGraph.id,
			},
			{
				fromNode: "route_keyword",
				toNode: "general_notice_specialist",
				agentGraphId: ocrConditionGraph.id,
			},
			{
				fromNode: "urgent_notice_specialist",
				toNode: "save_notice_summary",
				agentGraphId: ocrConditionGraph.id,
			},
			{
				fromNode: "general_notice_specialist",
				toNode: "save_notice_summary",
				agentGraphId: ocrConditionGraph.id,
			},
			{
				fromNode: "save_notice_summary",
				toNode: "END",
				agentGraphId: ocrConditionGraph.id,
			},
		]);

		const [ocrConditionDevice] = await tx
			.insert(devices)
			.values({
				name: "Seed OCR Condition Device",
				slug: "seed-ocr-condition-device",
				organizationId: organization.id,
				projectId: project.id,
				agentGraphId: ocrConditionGraph.id,
			})
			.returning({
				id: devices.id,
				slug: devices.slug,
			});
		if (!ocrConditionDevice) {
			throw new Error("Failed to create OCR condition device");
		}

		const [ocrConditionApiKey] = await tx
			.insert(apikeys)
			.values({
				name: "Seed OCR Condition API Key",
				start: plainOCRConditionApiKey.slice(0, 6),
				prefix: "seed",
				key: hashedOCRConditionApiKey,
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				kind: "device",
				deviceId: ocrConditionDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: deviceAPIKeyPermissionsJSON,
				metadata: JSON.stringify({
					source: "seed.ts",
					workflow: "ocr-condition",
				}),
			})
			.returning({
				id: apikeys.id,
			});
		if (!ocrConditionApiKey) {
			throw new Error("Failed to create OCR condition API key");
		}

		const insertedConditionOCRDocuments = await tx
			.insert(documents)
			.values(
				uploadedConditionOCRDocuments.map((seedDocument) => ({
					bucket,
					objectKey: seedDocument.objectKey,
					contentType: seedDocument.contentType,
					eTag: seedDocument.eTag,
					sizeBytes: seedDocument.sizeBytes,
					lastModifiedAt: seedDocument.lastModifiedAt,
					visibility: "org",
					organizationId: organization.id,
					projectId: project.id,
					deviceId: ocrConditionDevice.id,
				})),
			)
			.returning({
				id: documents.id,
				objectKey: documents.objectKey,
			});
		if (
			insertedConditionOCRDocuments.length !==
			uploadedConditionOCRDocuments.length
		) {
			throw new Error("Failed to insert OCR condition documents");
		}

		const conditionOCRDocumentIdByObjectKey = new Map(
			insertedConditionOCRDocuments.map((document) => [
				document.objectKey,
				document.id,
			]),
		);

		const conditionOCRDocumentsWithIds = uploadedConditionOCRDocuments.map(
			(seedDocument) => {
				const documentId = conditionOCRDocumentIdByObjectKey.get(
					seedDocument.objectKey,
				);
				if (!documentId) {
					throw new Error(
						`Failed to resolve OCR condition document id for ${seedDocument.objectKey}`,
					);
				}

				const seedInput = seedConditionOCRDocumentInputs.find(
					(input) => input.slug === seedDocument.slug,
				);
				if (!seedInput) {
					throw new Error(
						`Missing OCR condition seed input for ${seedDocument.slug}`,
					);
				}

				return {
					...seedDocument,
					documentId,
					ocrText: seedInput.ocrText,
					savedSummary: seedInput.savedSummary,
				};
			},
		);

		const insertedConditionDescriptions = await tx
			.insert(documentDescriptions)
			.values(
				conditionOCRDocumentsWithIds.map((seedDocument) => ({
					documentId: seedDocument.documentId,
					modelId: gpt41MiniModel.id,
					text: seedDocument.savedSummary,
				})),
			)
			.returning({
				id: documentDescriptions.id,
				documentId: documentDescriptions.documentId,
			});
		if (
			insertedConditionDescriptions.length !==
			conditionOCRDocumentsWithIds.length
		) {
			throw new Error("Failed to insert OCR condition descriptions");
		}

		const insertedConditionOCRResults = await tx
			.insert(documentOCRResults)
			.values(
				conditionOCRDocumentsWithIds.map((seedDocument) => ({
					documentId: seedDocument.documentId,
					modelId: deepseekOCRModel.id,
					input: {
						task_type: "Convert to Markdown",
					},
					text: seedDocument.ocrText,
					result: {
						markdown: seedDocument.ocrText,
					},
				})),
			)
			.returning({
				id: documentOCRResults.id,
				documentId: documentOCRResults.documentId,
			});

		const conditionOCRResultIdByDocumentId = new Map(
			insertedConditionOCRResults.map((row) => [row.documentId, row.id]),
		);
		const conditionDescriptionIdByDocumentId = new Map(
			insertedConditionDescriptions.map((row) => [row.documentId, row.id]),
		);

		// ── Agent Graph (workflow 6: OCR supervisor review) ──

		const [ocrSupervisorGraph] = await tx
			.insert(agentGraphs)
			.values({
				name: "OCR Review Supervisor",
				description:
					"Extracts OCR text with confidence metadata, routes it through an LLM supervisor, and saves the final review summary.",
				entryNode: "extract_ocr_confident",
				organizationId: organization.id,
			})
			.returning({ id: agentGraphs.id });
		if (!ocrSupervisorGraph) {
			throw new Error("Failed to create OCR supervisor graph");
		}

		const [extractOCRConfidentNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "extract_ocr_confident",
				nodeType: "tool",
				config: {
					input_mapping: {
						model_provider: "_const:REPLICATE",
						model_name: "_const:mind-ware/dots-ocr-with-confidence",
						model_version: `_const:${dotsOCRVersion}`,
						input_params: {
							return_confidence: true,
							confidence_threshold: 0.7,
						},
					},
					output_mapping: {
						ocr_result_id: "ocr_result_id",
						text: "ocr_text",
						avg_confidence: "ocr_avg_confidence",
						result: "ocr_raw_result",
					},
				},
				agentGraphId: ocrSupervisorGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!extractOCRConfidentNode) {
			throw new Error("Failed to create extract_ocr_confident node");
		}

		const [billingOCRSpecialistNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "billing_ocr_specialist",
				nodeType: "worker",
				config: {
					system_message:
						"You are the billing OCR specialist. When the OCR text looks like an invoice, receipt, bill, or payment request, summarize the vendor, amount, due date, and next billing action in one concise paragraph.",
					max_iterations: 3,
				},
				agentGraphId: ocrSupervisorGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!billingOCRSpecialistNode) {
			throw new Error("Failed to create billing_ocr_specialist node");
		}

		const [operationsOCRSpecialistNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "operations_ocr_specialist",
				nodeType: "worker",
				config: {
					system_message:
						"You are the operations OCR specialist. When the OCR text looks like a memo, checklist, schedule, or facilities instruction, summarize the operational action items, timing, and owner in one concise paragraph.",
					max_iterations: 3,
				},
				agentGraphId: ocrSupervisorGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!operationsOCRSpecialistNode) {
			throw new Error("Failed to create operations_ocr_specialist node");
		}

		const [ocrReviewSupervisorNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "ocr_review_supervisor",
				nodeType: "supervisor",
				inputKey: "ocr_text",
				outputKey: "ocr_review_summary",
				config: {
					members: ["billing_ocr_specialist", "operations_ocr_specialist"],
					input_prompt:
						"Route this OCR text to exactly one specialist. After the specialist responds, finish and hand off to save_review_summary.",
					max_iterations: 6,
					finish_target: "save_review_summary",
				},
				agentGraphId: ocrSupervisorGraph.id,
				modelId: gpt41MiniModel.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!ocrReviewSupervisorNode) {
			throw new Error("Failed to create ocr_review_supervisor node");
		}

		const [saveReviewSummaryNode] = await tx
			.insert(agentGraphNodes)
			.values({
				nodeKey: "save_review_summary",
				nodeType: "tool",
				config: {
					input_mapping: {
						text: "ocr_review_summary",
						model_provider: "_const:OPENAI",
						model_name: "_const:gpt-4.1-mini",
						model_version: "_const:",
					},
				},
				agentGraphId: ocrSupervisorGraph.id,
			})
			.returning({ id: agentGraphNodes.id });
		if (!saveReviewSummaryNode) {
			throw new Error("Failed to create save_review_summary node");
		}

		await tx.insert(agentGraphNodeTools).values([
			{
				agentGraphNodeId: extractOCRConfidentNode.id,
				toolId: createDocOCRTool.id,
			},
			{
				agentGraphNodeId: saveReviewSummaryNode.id,
				toolId: createDocDescTool.id,
			},
		]);

		await tx.insert(agentGraphEdges).values([
			{
				fromNode: "extract_ocr_confident",
				toNode: "ocr_review_supervisor",
				agentGraphId: ocrSupervisorGraph.id,
			},
			{
				fromNode: "ocr_review_supervisor",
				toNode: "save_review_summary",
				agentGraphId: ocrSupervisorGraph.id,
			},
			{
				fromNode: "save_review_summary",
				toNode: "END",
				agentGraphId: ocrSupervisorGraph.id,
			},
		]);

		const [ocrSupervisorDevice] = await tx
			.insert(devices)
			.values({
				name: "Seed OCR Supervisor Device",
				slug: "seed-ocr-supervisor-device",
				organizationId: organization.id,
				projectId: project.id,
				agentGraphId: ocrSupervisorGraph.id,
			})
			.returning({
				id: devices.id,
				slug: devices.slug,
			});
		if (!ocrSupervisorDevice) {
			throw new Error("Failed to create OCR supervisor device");
		}

		const [ocrSupervisorApiKey] = await tx
			.insert(apikeys)
			.values({
				name: "Seed OCR Supervisor API Key",
				start: plainOCRSupervisorApiKey.slice(0, 6),
				prefix: "seed",
				key: hashedOCRSupervisorApiKey,
				userId: user.id,
				organizationId: organization.id,
				projectId: project.id,
				kind: "device",
				deviceId: ocrSupervisorDevice.id,
				enabled: true,
				rateLimitEnabled: true,
				rateLimitTimeWindow: 86_400_000,
				rateLimitMax: 10,
				requestCount: 0,
				createdAt: now,
				updatedAt: now,
				permissions: deviceAPIKeyPermissionsJSON,
				metadata: JSON.stringify({
					source: "seed.ts",
					workflow: "ocr-supervisor",
				}),
			})
			.returning({
				id: apikeys.id,
			});
		if (!ocrSupervisorApiKey) {
			throw new Error("Failed to create OCR supervisor API key");
		}

		const insertedSupervisorOCRDocuments = await tx
			.insert(documents)
			.values(
				uploadedSupervisorOCRDocuments.map((seedDocument) => ({
					bucket,
					objectKey: seedDocument.objectKey,
					contentType: seedDocument.contentType,
					eTag: seedDocument.eTag,
					sizeBytes: seedDocument.sizeBytes,
					lastModifiedAt: seedDocument.lastModifiedAt,
					visibility: "org",
					organizationId: organization.id,
					projectId: project.id,
					deviceId: ocrSupervisorDevice.id,
				})),
			)
			.returning({
				id: documents.id,
				objectKey: documents.objectKey,
			});
		if (
			insertedSupervisorOCRDocuments.length !==
			uploadedSupervisorOCRDocuments.length
		) {
			throw new Error("Failed to insert OCR supervisor documents");
		}

		const supervisorOCRDocumentIdByObjectKey = new Map(
			insertedSupervisorOCRDocuments.map((document) => [
				document.objectKey,
				document.id,
			]),
		);

		const supervisorOCRDocumentsWithIds = uploadedSupervisorOCRDocuments.map(
			(seedDocument) => {
				const documentId = supervisorOCRDocumentIdByObjectKey.get(
					seedDocument.objectKey,
				);
				if (!documentId) {
					throw new Error(
						`Failed to resolve OCR supervisor document id for ${seedDocument.objectKey}`,
					);
				}

				const seedInput = seedSupervisorOCRDocumentInputs.find(
					(input) => input.slug === seedDocument.slug,
				);
				if (!seedInput) {
					throw new Error(
						`Missing OCR supervisor seed input for ${seedDocument.slug}`,
					);
				}

				return {
					...seedDocument,
					documentId,
					ocrText: seedInput.ocrText,
					savedSummary: seedInput.savedSummary,
					avgConfidence: seedInput.avgConfidence ?? null,
				};
			},
		);

		const insertedSupervisorDescriptions = await tx
			.insert(documentDescriptions)
			.values(
				supervisorOCRDocumentsWithIds.map((seedDocument) => ({
					documentId: seedDocument.documentId,
					modelId: gpt41MiniModel.id,
					text: seedDocument.savedSummary,
				})),
			)
			.returning({
				id: documentDescriptions.id,
				documentId: documentDescriptions.documentId,
			});
		if (
			insertedSupervisorDescriptions.length !==
			supervisorOCRDocumentsWithIds.length
		) {
			throw new Error("Failed to insert OCR supervisor descriptions");
		}

		const insertedSupervisorOCRResults = await tx
			.insert(documentOCRResults)
			.values(
				supervisorOCRDocumentsWithIds.map((seedDocument) => ({
					documentId: seedDocument.documentId,
					modelId: dotsOCRModel.id,
					input: {
						return_confidence: true,
						confidence_threshold: 0.7,
					},
					text: seedDocument.ocrText,
					avgConfidence: seedDocument.avgConfidence,
					result: {
						text: seedDocument.ocrText,
						avg_confidence: seedDocument.avgConfidence,
						low_confidence_count: 0,
						word_confidences: [],
					},
				})),
			)
			.returning({
				id: documentOCRResults.id,
				documentId: documentOCRResults.documentId,
			});

		const supervisorOCRResultIdByDocumentId = new Map(
			insertedSupervisorOCRResults.map((row) => [row.documentId, row.id]),
		);
		const supervisorDescriptionIdByDocumentId = new Map(
			insertedSupervisorDescriptions.map((row) => [row.documentId, row.id]),
		);

		const ocrRunBaseTime = new Date(runBaseTime.getTime() + 1000 * 120);

		const urgentConditionDoc = conditionOCRDocumentsWithIds.find(
			(document) => document.slug === "ocr-urgent-notice",
		);
		const generalConditionDoc = conditionOCRDocumentsWithIds.find(
			(document) => document.slug === "ocr-general-notice",
		);
		const invoiceOCRDoc = supervisorOCRDocumentsWithIds.find(
			(document) => document.slug === "ocr-invoice-review",
		);
		const operationsOCRDoc = supervisorOCRDocumentsWithIds.find(
			(document) => document.slug === "ocr-operations-review",
		);
		if (
			!urgentConditionDoc ||
			!generalConditionDoc ||
			!invoiceOCRDoc ||
			!operationsOCRDoc
		) {
			throw new Error("Failed to resolve OCR seed documents");
		}

		const [urgentConditionRun] = await tx
			.insert(agentGraphRuns)
			.values({
				agentGraphId: ocrConditionGraph.id,
				status: "completed",
				initialState: {
					temp_url: `https://s3.example.com/${urgentConditionDoc.objectKey}`,
					document_id: urgentConditionDoc.documentId,
				},
				finalState: {
					document_id: urgentConditionDoc.documentId,
					ocr_result_id:
						conditionOCRResultIdByDocumentId.get(
							urgentConditionDoc.documentId,
						) ?? null,
					ocr_text: urgentConditionDoc.ocrText,
					contains_urgent: true,
					notice_summary: urgentConditionDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime()),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 9),
			})
			.returning({ id: agentGraphRuns.id });
		if (!urgentConditionRun) {
			throw new Error("Failed to create urgent OCR condition run");
		}

		await tx.insert(agentGraphRunSteps).values([
			{
				runId: urgentConditionRun.id,
				nodeKey: "extract_ocr",
				stepOrder: 1,
				stateDelta: {
					ocr_result_id:
						conditionOCRResultIdByDocumentId.get(
							urgentConditionDoc.documentId,
						) ?? null,
					ocr_text: urgentConditionDoc.ocrText,
				},
				startedAt: new Date(ocrRunBaseTime.getTime()),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 2),
			},
			{
				runId: urgentConditionRun.id,
				nodeKey: "route_keyword",
				stepOrder: 2,
				stateDelta: {
					contains_urgent: true,
					branch: "urgent_notice_specialist",
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 2),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 3),
			},
			{
				runId: urgentConditionRun.id,
				nodeKey: "urgent_notice_specialist",
				stepOrder: 3,
				stateDelta: {
					notice_summary: urgentConditionDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 3),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 6),
			},
			{
				runId: urgentConditionRun.id,
				nodeKey: "save_notice_summary",
				stepOrder: 4,
				stateDelta: {
					document_description_id:
						conditionDescriptionIdByDocumentId.get(
							urgentConditionDoc.documentId,
						) ?? null,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 6),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 9),
			},
		]);

		const [generalConditionRun] = await tx
			.insert(agentGraphRuns)
			.values({
				agentGraphId: ocrConditionGraph.id,
				status: "completed",
				initialState: {
					temp_url: `https://s3.example.com/${generalConditionDoc.objectKey}`,
					document_id: generalConditionDoc.documentId,
				},
				finalState: {
					document_id: generalConditionDoc.documentId,
					ocr_result_id:
						conditionOCRResultIdByDocumentId.get(
							generalConditionDoc.documentId,
						) ?? null,
					ocr_text: generalConditionDoc.ocrText,
					contains_urgent: false,
					notice_summary: generalConditionDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 15),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 24),
			})
			.returning({ id: agentGraphRuns.id });
		if (!generalConditionRun) {
			throw new Error("Failed to create general OCR condition run");
		}

		await tx.insert(agentGraphRunSteps).values([
			{
				runId: generalConditionRun.id,
				nodeKey: "extract_ocr",
				stepOrder: 1,
				stateDelta: {
					ocr_result_id:
						conditionOCRResultIdByDocumentId.get(
							generalConditionDoc.documentId,
						) ?? null,
					ocr_text: generalConditionDoc.ocrText,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 15),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 17),
			},
			{
				runId: generalConditionRun.id,
				nodeKey: "route_keyword",
				stepOrder: 2,
				stateDelta: {
					contains_urgent: false,
					branch: "general_notice_specialist",
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 17),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 18),
			},
			{
				runId: generalConditionRun.id,
				nodeKey: "general_notice_specialist",
				stepOrder: 3,
				stateDelta: {
					notice_summary: generalConditionDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 18),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 21),
			},
			{
				runId: generalConditionRun.id,
				nodeKey: "save_notice_summary",
				stepOrder: 4,
				stateDelta: {
					document_description_id:
						conditionDescriptionIdByDocumentId.get(
							generalConditionDoc.documentId,
						) ?? null,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 21),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 24),
			},
		]);

		const [invoiceSupervisorRun] = await tx
			.insert(agentGraphRuns)
			.values({
				agentGraphId: ocrSupervisorGraph.id,
				status: "completed",
				initialState: {
					temp_url: `https://s3.example.com/${invoiceOCRDoc.objectKey}`,
					document_id: invoiceOCRDoc.documentId,
				},
				finalState: {
					document_id: invoiceOCRDoc.documentId,
					ocr_result_id:
						supervisorOCRResultIdByDocumentId.get(invoiceOCRDoc.documentId) ??
						null,
					ocr_text: invoiceOCRDoc.ocrText,
					ocr_avg_confidence: invoiceOCRDoc.avgConfidence,
					ocr_review_summary: invoiceOCRDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 30),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 44),
			})
			.returning({ id: agentGraphRuns.id });
		if (!invoiceSupervisorRun) {
			throw new Error("Failed to create invoice OCR supervisor run");
		}

		await tx.insert(agentGraphRunSteps).values([
			{
				runId: invoiceSupervisorRun.id,
				nodeKey: "extract_ocr_confident",
				stepOrder: 1,
				stateDelta: {
					ocr_result_id:
						supervisorOCRResultIdByDocumentId.get(invoiceOCRDoc.documentId) ??
						null,
					ocr_text: invoiceOCRDoc.ocrText,
					ocr_avg_confidence: invoiceOCRDoc.avgConfidence,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 30),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 33),
			},
			{
				runId: invoiceSupervisorRun.id,
				nodeKey: "ocr_review_supervisor",
				stepOrder: 2,
				stateDelta: {
					routing_decision: "billing_ocr_specialist",
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 33),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 35),
			},
			{
				runId: invoiceSupervisorRun.id,
				nodeKey: "billing_ocr_specialist",
				stepOrder: 3,
				stateDelta: {
					ocr_review_summary: invoiceOCRDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 35),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 39),
			},
			{
				runId: invoiceSupervisorRun.id,
				nodeKey: "ocr_review_supervisor",
				stepOrder: 4,
				stateDelta: {
					decision: "FINISH",
					finish_target: "save_review_summary",
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 39),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 41),
			},
			{
				runId: invoiceSupervisorRun.id,
				nodeKey: "save_review_summary",
				stepOrder: 5,
				stateDelta: {
					document_description_id:
						supervisorDescriptionIdByDocumentId.get(invoiceOCRDoc.documentId) ??
						null,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 41),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 44),
			},
		]);

		const [operationsSupervisorRun] = await tx
			.insert(agentGraphRuns)
			.values({
				agentGraphId: ocrSupervisorGraph.id,
				status: "completed",
				initialState: {
					temp_url: `https://s3.example.com/${operationsOCRDoc.objectKey}`,
					document_id: operationsOCRDoc.documentId,
				},
				finalState: {
					document_id: operationsOCRDoc.documentId,
					ocr_result_id:
						supervisorOCRResultIdByDocumentId.get(
							operationsOCRDoc.documentId,
						) ?? null,
					ocr_text: operationsOCRDoc.ocrText,
					ocr_avg_confidence: operationsOCRDoc.avgConfidence,
					ocr_review_summary: operationsOCRDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 50),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 64),
			})
			.returning({ id: agentGraphRuns.id });
		if (!operationsSupervisorRun) {
			throw new Error("Failed to create operations OCR supervisor run");
		}

		await tx.insert(agentGraphRunSteps).values([
			{
				runId: operationsSupervisorRun.id,
				nodeKey: "extract_ocr_confident",
				stepOrder: 1,
				stateDelta: {
					ocr_result_id:
						supervisorOCRResultIdByDocumentId.get(
							operationsOCRDoc.documentId,
						) ?? null,
					ocr_text: operationsOCRDoc.ocrText,
					ocr_avg_confidence: operationsOCRDoc.avgConfidence,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 50),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 53),
			},
			{
				runId: operationsSupervisorRun.id,
				nodeKey: "ocr_review_supervisor",
				stepOrder: 2,
				stateDelta: {
					routing_decision: "operations_ocr_specialist",
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 53),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 55),
			},
			{
				runId: operationsSupervisorRun.id,
				nodeKey: "operations_ocr_specialist",
				stepOrder: 3,
				stateDelta: {
					ocr_review_summary: operationsOCRDoc.savedSummary,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 55),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 59),
			},
			{
				runId: operationsSupervisorRun.id,
				nodeKey: "ocr_review_supervisor",
				stepOrder: 4,
				stateDelta: {
					decision: "FINISH",
					finish_target: "save_review_summary",
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 59),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 61),
			},
			{
				runId: operationsSupervisorRun.id,
				nodeKey: "save_review_summary",
				stepOrder: 5,
				stateDelta: {
					document_description_id:
						supervisorDescriptionIdByDocumentId.get(
							operationsOCRDoc.documentId,
						) ?? null,
				},
				startedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 61),
				finishedAt: new Date(ocrRunBaseTime.getTime() + 1000 * 64),
			},
		]);

		// Seed a mix of organization-only and organization-owned public templates.
		// Public templates remain owned by Seed Organization so the data matches
		// the intended sharing model in the dashboard.
		const workflowTemplates = [
			await cloneWorkflowToTemplate(tx, {
				workflowId: remoteSensingGraph.id,
				organizationId: organization.id,
			}),
			await cloneWorkflowToTemplate(tx, {
				workflowId: pipelineGraph.id,
				organizationId: organization.id,
				visibility: "public",
			}),
			await cloneWorkflowToTemplate(tx, {
				workflowId: qualityReviewGraph.id,
				organizationId: organization.id,
				visibility: "public",
			}),
			await cloneWorkflowToTemplate(tx, {
				workflowId: segmentationGraph.id,
				organizationId: organization.id,
			}),
			await cloneWorkflowToTemplate(tx, {
				workflowId: semanticSegmentationGraph.id,
				organizationId: organization.id,
			}),
			await cloneWorkflowToTemplate(tx, {
				workflowId: ocrConditionGraph.id,
				organizationId: organization.id,
				visibility: "public",
			}),
			await cloneWorkflowToTemplate(tx, {
				workflowId: ocrSupervisorGraph.id,
				organizationId: organization.id,
				visibility: "public",
			}),
		];

		return {
			user,
			seededLoginUser,
			dashboardSession,
			organization,
			secondaryOrganization,
			project,
			secondaryProject,
			serviceApiKey,
			remoteSensingGraph,
			pipelineDevice,
			pipelineApiKey,
			pipelineGraph,
			qualityReviewDevice,
			qualityReviewApiKey,
			qualityReviewGraph,
			segmentationDevice,
			segmentationApiKey,
			segmentationGraph,
			semanticSegmentationDevice,
			semanticSegmentationApiKey,
			semanticSegmentationGraph,
			ocrConditionDevice,
			ocrConditionApiKey,
			ocrConditionGraph,
			ocrSupervisorDevice,
			ocrSupervisorApiKey,
			ocrSupervisorGraph,
			clipModel,
			gpt41MiniModel,
			semanticSegmentationModel,
			langSegmentationModel,
			deepseekOCRModel,
			dotsOCRModel,
			workflowTemplates,
			seededDocuments: seedDocumentsWithIds,
			seededDescriptionCount: insertedDescriptions.length,
			seededQRDocuments: qrSeedDocumentsWithIds,
			seededQRDescriptionCount: insertedQRDescriptions.length,
			seededSegmentationDocuments: segmentationSeedDocumentsWithIds,
			seededSemanticSegmentationDocuments:
				semanticSegmentationSeedDocumentsWithIds,
			seededConditionOCRDocuments: conditionOCRDocumentsWithIds,
			seededSupervisorOCRDocuments: supervisorOCRDocumentsWithIds,
			agentRuns: {
				goodRun: {
					id: goodRun.id,
					document: "sharp-puppy",
					verdict: "GOOD",
				},
				badRun: { id: badRun.id, document: "soft-focus-cat", verdict: "BAD" },
				washedOutRun: {
					id: washedOutRun.id,
					document: "washed-out-shoreline",
					verdict: "BAD",
				},
				urgentConditionRun: {
					id: urgentConditionRun.id,
					document: "ocr-urgent-notice",
					verdict: "URGENT",
				},
				generalConditionRun: {
					id: generalConditionRun.id,
					document: "ocr-general-notice",
					verdict: "ROUTINE",
				},
				invoiceSupervisorRun: {
					id: invoiceSupervisorRun.id,
					document: "ocr-invoice-review",
					verdict: "BILLING",
				},
				operationsSupervisorRun: {
					id: operationsSupervisorRun.id,
					document: "ocr-operations-review",
					verdict: "OPERATIONS",
				},
			},
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
		"Use this raw session token as DASHBOARD_SESSION_TOKEN in the API env for local debug session bootstrap.",
	);
	console.log(
		`Organization: ${result.organization.slug} (${result.organization.id})`,
	);
	console.log(`Project: ${result.project.slug} (${result.project.id})`);
	console.log(
		`Organization (secondary): ${result.secondaryOrganization.slug} (${result.secondaryOrganization.id})`,
	);
	console.log(
		`Project (secondary): ${result.secondaryProject.slug} (${result.secondaryProject.id})`,
	);
	if (result.seededLoginUser) {
		console.log(
			`Seeded OTP Login User: ${result.seededLoginUser.email} (${result.seededLoginUser.id})`,
		);
	} else if (seededDashboardUserEmail) {
		console.log(
			`Seeded OTP Login User: skipped because ${seededDashboardUserEmail} already matches the primary seed user`,
		);
	} else {
		console.log(
			"Seeded OTP Login User: not created (set SEED_DASHBOARD_USER_EMAIL to enable)",
		);
	}
	console.log(`Service API Key ID: ${result.serviceApiKey.id}`);
	console.log(`Service API Key (plain): ${plainServiceApiKey}`);
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
	console.log(
		`Device (workflow 3, language segmentation): ${result.segmentationDevice.slug} (${result.segmentationDevice.id})`,
	);
	console.log(`API Key ID (workflow 3): ${result.segmentationApiKey.id}`);
	console.log(`API Key (plain, workflow 3): ${plainSegmentationApiKey}`);
	console.log(
		`Device (workflow 4, semantic segmentation): ${result.semanticSegmentationDevice.slug} (${result.semanticSegmentationDevice.id})`,
	);
	console.log(
		`API Key ID (workflow 4): ${result.semanticSegmentationApiKey.id}`,
	);
	console.log(
		`API Key (plain, workflow 4): ${plainSemanticSegmentationApiKey}`,
	);
	console.log(
		`Device (workflow 5, OCR condition): ${result.ocrConditionDevice.slug} (${result.ocrConditionDevice.id})`,
	);
	console.log(`API Key ID (workflow 5): ${result.ocrConditionApiKey.id}`);
	console.log(`API Key (plain, workflow 5): ${plainOCRConditionApiKey}`);
	console.log(
		`Device (workflow 6, OCR supervisor): ${result.ocrSupervisorDevice.slug} (${result.ocrSupervisorDevice.id})`,
	);
	console.log(`API Key ID (workflow 6): ${result.ocrSupervisorApiKey.id}`);
	console.log(`API Key (plain, workflow 6): ${plainOCRSupervisorApiKey}`);
	console.log(
		`\nAgent Graph (workflow 0, remote sensing): ${result.remoteSensingGraph.id}`,
	);
	console.log(`Agent Graph (workflow 1): ${result.pipelineGraph.id}`);
	console.log(`Agent Graph (workflow 2): ${result.qualityReviewGraph.id}`);
	console.log(
		`Agent Graph (workflow 3, language segmentation): ${result.segmentationGraph.id}`,
	);
	console.log(
		`Agent Graph (workflow 4, semantic segmentation): ${result.semanticSegmentationGraph.id}`,
	);
	console.log(
		`Agent Graph (workflow 5, OCR condition): ${result.ocrConditionGraph.id}`,
	);
	console.log(
		`Agent Graph (workflow 6, OCR supervisor): ${result.ocrSupervisorGraph.id}`,
	);
	console.log("\nSeeded workflow templates:");
	for (const workflowTemplate of result.workflowTemplates) {
		console.log(
			`  ${workflowTemplate.name} v${workflowTemplate.version}: ${workflowTemplate.id} (source workflow ${workflowTemplate.sourceWorkflowId})`,
		);
	}
	console.log(`CLIP Model: ${result.clipModel.id}`);
	console.log(`GPT-4.1 Mini Model: ${result.gpt41MiniModel.id}`);
	console.log(
		`Semantic segmentation model: ${result.semanticSegmentationModel.id}`,
	);
	console.log(
		`Language segmentation model: ${result.langSegmentationModel.id}`,
	);
	console.log(`DeepSeek OCR model: ${result.deepseekOCRModel.id}`);
	console.log(`DOTS OCR model: ${result.dotsOCRModel.id}`);
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
	console.log(
		`Seeded documents (language segmentation): ${result.seededSegmentationDocuments.length}`,
	);
	for (const seededDocument of result.seededSegmentationDocuments) {
		console.log(
			`  Language segmentation doc: ${seededDocument.objectKey} (${seededDocument.documentId})`,
		);
	}
	console.log(
		`Seeded documents (semantic segmentation): ${result.seededSemanticSegmentationDocuments.length}`,
	);
	for (const seededDocument of result.seededSemanticSegmentationDocuments) {
		console.log(
			`  Semantic segmentation doc: ${seededDocument.objectKey} (${seededDocument.documentId})`,
		);
	}
	console.log(
		`Seeded documents (OCR condition): ${result.seededConditionOCRDocuments.length}`,
	);
	for (const seededDocument of result.seededConditionOCRDocuments) {
		console.log(
			`  OCR condition doc: ${seededDocument.objectKey} (${seededDocument.documentId})`,
		);
	}
	console.log(
		`Seeded documents (OCR supervisor): ${result.seededSupervisorOCRDocuments.length}`,
	);
	for (const seededDocument of result.seededSupervisorOCRDocuments) {
		console.log(
			`  OCR supervisor doc: ${seededDocument.objectKey} (${seededDocument.documentId})`,
		);
	}
	console.log("\nSeeded Agent Graph Runs:");
	for (const [label, run] of Object.entries(result.agentRuns)) {
		console.log(`  ${label}: ${run.document} → ${run.verdict} (${run.id})`);
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
