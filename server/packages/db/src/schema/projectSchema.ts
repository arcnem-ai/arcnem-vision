import { sql } from "drizzle-orm";
import {
	bigint,
	check,
	customType,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { devices, organizations, projects } from "./authSchema";

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
		deviceId: uuid("device_id")
			.notNull()
			.references(() => devices.id),
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
		index("documents_device_id_idx").on(table.deviceId),
		index("documents_device_id_id_idx").on(table.deviceId, table.id),
		index("documents_device_created_at_idx").on(
			table.deviceId,
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
		deviceId: uuid("device_id")
			.notNull()
			.references(() => devices.id),
		status: text().notNull().default("issued"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("presigned_uploads_object_key_device_uidx").on(
			table.objectKey,
			table.deviceId,
		),
		index("presigned_uploads_status_created_at_idx").on(
			table.status,
			table.createdAt,
		),
		index("presigned_uploads_device_status_idx").on(
			table.deviceId,
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
		type: text(),
		embeddingDim: integer("embedding_dim"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("models_provider_name_unique").on(table.provider, table.name),
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
