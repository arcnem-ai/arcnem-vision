import { sql } from "drizzle-orm";
import type { PGDB } from "./client/getDB";
import { models, tools } from "./schema";

// The model and tool catalog every installation needs. The local seed and the
// production bootstrap both insert it; existing rows are left untouched.

export const semanticSegmentAnythingVersion =
	"b2691db53f2d96add0051a4a98e7a3861bd21bf5972031119d344d956d2f8256";
export const langSegmentAnythingVersion =
	"891411c38a6ed2d44c004b7b9e44217df7a5b07848f29ddefd2e28bc7cbf93bc";
export const deepseekOCRVersion =
	"cb3b474fbfc56b1664c8c7841550bccecbe7b74c30e45ce938ffca1180b4dff5";
export const dotsOCRVersion =
	"91ce60f4885d7ca6e095755e25d0f9ff2bcfe963c816937ece4be50d811f26c4";

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

export const CATALOG_MODELS = {
	clip: {
		provider: "REPLICATE",
		name: "openai/clip",
		version: "",
		type: "embedding",
		embeddingDim: 768,
		config: {},
	},
	gpt41Mini: {
		provider: "OPENAI",
		name: "gpt-4.1-mini",
		version: "",
		type: "chat",
		config: {},
	},
	gpt56Luna: {
		provider: "OPENAI",
		name: "gpt-5.6-luna",
		version: "",
		type: "chat",
		config: {},
	},
	semanticSegmentation: {
		provider: "REPLICATE",
		name: "cjwbw/semantic-segment-anything",
		version: semanticSegmentAnythingVersion,
		type: "segmentation",
		inputSchema: semanticSegmentationInputSchema,
		outputSchema: semanticSegmentationOutputSchema,
		config: semanticSegmentationModelConfig,
	},
	langSegmentation: {
		provider: "REPLICATE",
		name: "tmappdev/lang-segment-anything",
		version: langSegmentAnythingVersion,
		type: "segmentation",
		inputSchema: langSegmentationInputSchema,
		outputSchema: langSegmentationOutputSchema,
		config: langSegmentationModelConfig,
	},
	deepseekOCR: {
		provider: "REPLICATE",
		name: "lucataco/deepseek-ocr",
		version: deepseekOCRVersion,
		type: "ocr",
		inputSchema: deepseekOCRInputSchema,
		outputSchema: deepseekOCROutputSchema,
		config: deepseekOCRModelConfig,
	},
	dotsOCR: {
		provider: "REPLICATE",
		name: "mind-ware/dots-ocr-with-confidence",
		version: dotsOCRVersion,
		type: "ocr",
		inputSchema: dotsOCRInputSchema,
		outputSchema: dotsOCROutputSchema,
		config: dotsOCRModelConfig,
	},
} as const;

export const CATALOG_TOOLS = {
	createDocDesc: {
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
	},
	createDocEmb: {
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
	},
	createDocSeg: {
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
	},
	createDocOCR: {
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
	},
	createDescEmb: {
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
	},
	findSimilarDocs: {
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
	},
	findSimilarDescs: {
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
	},
} as const;

type CatalogIds = {
	models: Record<keyof typeof CATALOG_MODELS, string>;
	tools: Record<keyof typeof CATALOG_TOOLS, string>;
};

type CatalogDB = Pick<PGDB, "insert" | "select">;

// Inserts missing catalog rows and returns every catalog row's ID.
export async function ensureCatalog(db: CatalogDB): Promise<CatalogIds> {
	const modelIds = {} as CatalogIds["models"];
	for (const [key, model] of Object.entries(CATALOG_MODELS)) {
		await db.insert(models).values(model).onConflictDoNothing();
		const [row] = await db
			.select({ id: models.id })
			.from(models)
			.where(
				sql`${models.provider} = ${model.provider} AND ${models.name} = ${model.name} AND ${models.version} = ${model.version}`,
			);
		if (!row) throw new Error(`Catalog model ${model.name} is missing`);
		modelIds[key as keyof typeof CATALOG_MODELS] = row.id;
	}
	const toolIds = {} as CatalogIds["tools"];
	for (const [key, tool] of Object.entries(CATALOG_TOOLS)) {
		await db.insert(tools).values(tool).onConflictDoNothing();
		const [row] = await db
			.select({ id: tools.id })
			.from(tools)
			.where(sql`${tools.name} = ${tool.name}`);
		if (!row) throw new Error(`Catalog tool ${tool.name} is missing`);
		toolIds[key as keyof typeof CATALOG_TOOLS] = row.id;
	}
	return { models: modelIds, tools: toolIds };
}
