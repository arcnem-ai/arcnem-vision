import { sql } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { agentGraphRuns } from "./agentGraphSchemas";
import { apikeys, projects } from "./authSchema";

export const webhookEndpoints = pgTable(
	"webhook_endpoints",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		// Like other API key references, this blocks hard deletion so history stays.
		apiKeyId: uuid("api_key_id")
			.notNull()
			.references(() => apikeys.id),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		// Immutable: replace the endpoint to change its URL or signing secret.
		url: text("url").notNull(),
		signingSecretCiphertext: text("signing_secret_ciphertext").notNull(),
		// enabled | revoked
		status: text("status").notNull().default("enabled"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(t) => [
		index("webhook_endpoints_api_key_id_idx").on(t.apiKeyId),
		index("webhook_endpoints_project_id_idx").on(t.projectId),
	],
);

// Deliveries are the transactional outbox: the Go finalizer inserts them in the
// same transaction as a run's first terminal transition.
export const webhookDeliveries = pgTable(
	"webhook_deliveries",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		endpointId: uuid("endpoint_id")
			.notNull()
			.references(() => webhookEndpoints.id, { onDelete: "cascade" }),
		runId: uuid("run_id")
			.notNull()
			.references(() => agentGraphRuns.id, { onDelete: "cascade" }),
		// Stable across retries and resends; receivers deduplicate on it.
		eventId: text("event_id").notNull(),
		// workflow.completed | workflow.failed
		eventType: text("event_type").notNull(),
		// Frozen request body. Text, not jsonb, so signed bytes never change.
		body: text("body").notNull(),
		// pending | delivered | failed | cancelled
		status: text("status").notNull().default("pending"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("webhook_deliveries_endpoint_event_uidx").on(
			t.endpointId,
			t.eventId,
		),
		index("webhook_deliveries_run_id_idx").on(t.runId),
	],
);

export const webhookDeliveryAttempts = pgTable(
	"webhook_delivery_attempts",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		deliveryId: uuid("delivery_id")
			.notNull()
			.references(() => webhookDeliveries.id, { onDelete: "cascade" }),
		attemptNumber: integer("attempt_number").notNull(),
		// pending | succeeded | retryable | rejected
		outcome: text("outcome").notNull().default("pending"),
		httpStatus: integer("http_status"),
		// dns | blocked_destination | connect | tls | timeout | response_too_large
		errorCategory: text("error_category"),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		finishedAt: timestamp("finished_at"),
	},
	(t) => [
		uniqueIndex("webhook_delivery_attempts_delivery_attempt_uidx").on(
			t.deliveryId,
			t.attemptNumber,
		),
	],
);
