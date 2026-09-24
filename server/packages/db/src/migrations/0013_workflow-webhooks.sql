CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"http_status" integer,
	"error_category" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"api_key_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"signing_secret_ciphertext" text NOT NULL,
	"status" text DEFAULT 'enabled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_graph_runs" DROP CONSTRAINT "agent_graph_runs_idempotency_fields_together";--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_run_id_agent_graph_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_graph_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempts" ADD CONSTRAINT "webhook_delivery_attempts_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_api_key_id_apikeys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_endpoint_event_uidx" ON "webhook_deliveries" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_run_id_idx" ON "webhook_deliveries" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_attempts_delivery_attempt_uidx" ON "webhook_delivery_attempts" USING btree ("delivery_id","attempt_number");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_api_key_id_idx" ON "webhook_endpoints" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_project_id_idx" ON "webhook_endpoints" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD CONSTRAINT "agent_graph_runs_idempotency_fields_together" CHECK ((
				"agent_graph_runs"."idempotency_key" is null and
				"agent_graph_runs"."idempotency_actor" is null and
				"agent_graph_runs"."idempotency_request_hash" is null and
				"agent_graph_runs"."idempotency_response" is null
			) or (
				"agent_graph_runs"."idempotency_key" is not null and
				(("agent_graph_runs"."api_key_id" is not null and "agent_graph_runs"."idempotency_actor" is null) or
				 ("agent_graph_runs"."api_key_id" is null and "agent_graph_runs"."idempotency_actor" is not null)) and
				"agent_graph_runs"."idempotency_request_hash" is not null and
				"agent_graph_runs"."idempotency_response" is not null
			));