import { sql } from "drizzle-orm";
import {
	bigint,
	check,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { apikeys, organizations, projects } from "./authSchema";

const variableVector = customType<{ data: number[]; driverData: string }>({
	dataType() {
		return "vector";
	},
	toDriver(value) {
		return JSON.stringify(value);
	},
	fromDriver(value) {
		return value
			.slice(1, -1)
			.split(",")
			.map((v) => Number.parseFloat(v));
	},
});

export const documents = pgTable(
	"documents",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		bucket: text("bucket").notNull(),
		objectKey: text("object_key").notNull(),
		contentType: text("content_type").notNull(),
		eTag: text("etag").notNull(),
		sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
		lastModifiedAt: timestamp().notNull(),
		visibility: text().notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		apiKeyId: uuid("api_key_id").references(() => apikeys.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("documents_bucket_object_key_uidx").on(
			table.bucket,
			table.objectKey,
		),
		index("documents_organization_id_idx").on(table.organizationId),
		index("documents_organization_id_id_idx").on(
			table.organizationId,
			table.id,
		),
		index("documents_project_id_idx").on(table.projectId),
		index("documents_api_key_id_idx").on(table.apiKeyId),
		index("documents_api_key_id_id_idx").on(table.apiKeyId, table.id),
		index("documents_api_key_created_at_idx").on(
			table.apiKeyId,
			table.createdAt,
		),
		check("documents_size_bytes_positive", sql`${table.sizeBytes} > 0`),
		check(
			"documents_visibility_known",
			sql`${table.visibility} in ('org', 'private', 'public')`,
		),
	],
);

export const presignedUploads = pgTable(
	"presigned_uploads",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		bucket: text("bucket").notNull(),
		objectKey: text("object_key").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		apiKeyId: uuid("api_key_id").references(() => apikeys.id),
		visibility: text("visibility").notNull().default("org"),
		status: text().notNull().default("issued"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("presigned_uploads_object_key_uidx").on(table.objectKey),
		index("presigned_uploads_organization_id_idx").on(table.organizationId),
		index("presigned_uploads_project_id_idx").on(table.projectId),
		index("presigned_uploads_status_created_at_idx").on(
			table.status,
			table.createdAt,
		),
		index("presigned_uploads_api_key_status_idx").on(
			table.apiKeyId,
			table.status,
		),
		check(
			"presigned_uploads_status_known",
			sql`${table.status} in ('issued', 'verified')`,
		),
	],
);

export const models = pgTable(
	"models",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		provider: text("provider").notNull(),
		name: text("name").notNull(),
		version: text("version").notNull().default(""),
		type: text(),
		embeddingDim: integer("embedding_dim"),
		inputSchema: jsonb("input_schema"),
		outputSchema: jsonb("output_schema"),
		config: jsonb("config").notNull().default("{}"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("models_provider_name_version_unique").on(
			table.provider,
			table.name,
			table.version,
		),
		check("models_embedding_dim_positive", sql`${table.embeddingDim} > 0`),
	],
);

export const documentEmbeddings = pgTable(
	"document_embeddings",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		documentId: uuid("document_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		modelId: uuid("model_id")
			.notNull()
			.references(() => models.id, { onDelete: "restrict" }),
		embeddingDim: integer("embedding_dim").notNull().default(768),
		embedding: variableVector("embedding").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex(
			"document_embeddings_document_model_id_embedding_dim_unique",
		).on(table.documentId, table.modelId, table.embeddingDim),
		index("document_embeddings_model_id_embedding_dim_idx").on(
			table.modelId,
			table.embeddingDim,
		),
		check(
			"document_embeddings_embedding_dim_matches_vector",
			sql`vector_dims(${table.embedding}) = ${table.embeddingDim}`,
		),
		check(
			"document_embeddings_embedding_dim_positive",
			sql`${table.embeddingDim} > 0`,
		),
		index("document_embeddings_embedding_cosine_768_idx")
			.using("hnsw", sql`(embedding::vector(768)) vector_cosine_ops`)
			.where(sql`${table.embeddingDim} = 768`),
		index("document_embeddings_embedding_cosine_1536_idx")
			.using("hnsw", sql`(embedding::vector(1536)) vector_cosine_ops`)
			.where(sql`${table.embeddingDim} = 1536`),
	],
);

export const documentDescriptions = pgTable(
	"document_descriptions",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		documentId: uuid("document_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		modelId: uuid("model_id")
			.notNull()
			.references(() => models.id, { onDelete: "restrict" }),
		text: text().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("document_descriptions_document_model_id_unique").on(
			table.documentId,
			table.modelId,
		),
		index("document_descriptions_model_id_idx").on(table.modelId),
	],
);

export const documentSegmentations = pgTable(
	"document_segmentations",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		sourceDocumentId: uuid("source_document_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		segmentedDocumentId: uuid("segmented_document_id").references(
			() => documents.id,
			{ onDelete: "set null" },
		),
		modelId: uuid("model_id")
			.notNull()
			.references(() => models.id, { onDelete: "restrict" }),
		input: jsonb("input").notNull().default("{}"),
		result: jsonb("result").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("document_segmentations_source_document_id_idx").on(
			table.sourceDocumentId,
		),
		index("document_segmentations_segmented_document_id_idx").on(
			table.segmentedDocumentId,
		),
		index("document_segmentations_model_id_idx").on(table.modelId),
		index("document_segmentations_source_document_model_id_idx").on(
			table.sourceDocumentId,
			table.modelId,
		),
	],
);

export const documentOCRResults = pgTable(
	"document_ocr_results",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		documentId: uuid("document_id")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		modelId: uuid("model_id")
			.notNull()
			.references(() => models.id, { onDelete: "restrict" }),
		input: jsonb("input").notNull().default("{}"),
		text: text("text").notNull(),
		avgConfidence: integer("avg_confidence"),
		result: jsonb("result").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("document_ocr_results_document_id_idx").on(table.documentId),
		index("document_ocr_results_model_id_idx").on(table.modelId),
		index("document_ocr_results_document_created_at_idx").on(
			table.documentId,
			table.createdAt,
		),
	],
);

export const documentDescriptionEmbeddings = pgTable(
	"document_description_embeddings",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		documentDescriptionId: uuid("document_description_id")
			.notNull()
			.references(() => documentDescriptions.id, { onDelete: "cascade" }),
		modelId: uuid("model_id")
			.notNull()
			.references(() => models.id, { onDelete: "restrict" }),
		embeddingDim: integer("embedding_dim").notNull().default(768),
		embedding: variableVector("embedding").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex(
			"document_description_embeddings_description_model_id_embedding_dim_unique",
		).on(table.documentDescriptionId, table.modelId, table.embeddingDim),
		index("document_description_embeddings_model_id_embedding_dim_idx").on(
			table.modelId,
			table.embeddingDim,
		),
		check(
			"document_description_embeddings_embedding_dim_matches_vector",
			sql`vector_dims(${table.embedding}) = ${table.embeddingDim}`,
		),
		check(
			"document_description_embeddings_embedding_dim_positive",
			sql`${table.embeddingDim} > 0`,
		),
		index("document_description_embeddings_embedding_cosine_768_idx")
			.using("hnsw", sql`(embedding::vector(768)) vector_cosine_ops`)
			.where(sql`${table.embeddingDim} = 768`),
		index("document_description_embeddings_embedding_cosine_1536_idx")
			.using("hnsw", sql`(embedding::vector(1536)) vector_cosine_ops`)
			.where(sql`${table.embeddingDim} = 1536`),
	],
);
