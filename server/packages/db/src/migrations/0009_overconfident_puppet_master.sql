ALTER TABLE "agent_graph_runs" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD COLUMN "idempotency_request_hash" text;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD COLUMN "idempotency_response" jsonb;--> statement-breakpoint
ALTER TABLE "presigned_uploads" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD CONSTRAINT "agent_graph_runs_api_key_id_apikeys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_graph_runs_api_key_idempotency_key_uidx" ON "agent_graph_runs" USING btree ("api_key_id","idempotency_key") WHERE "agent_graph_runs"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "presigned_uploads_api_key_idempotency_key_uidx" ON "presigned_uploads" USING btree ("api_key_id","idempotency_key") WHERE "presigned_uploads"."idempotency_key" is not null;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD CONSTRAINT "agent_graph_runs_idempotency_fields_together" CHECK ((
				"agent_graph_runs"."idempotency_key" is null and
				"agent_graph_runs"."api_key_id" is null and
				"agent_graph_runs"."idempotency_request_hash" is null and
				"agent_graph_runs"."idempotency_response" is null
			) or (
				"agent_graph_runs"."idempotency_key" is not null and
				"agent_graph_runs"."api_key_id" is not null and
				"agent_graph_runs"."idempotency_request_hash" is not null and
				"agent_graph_runs"."idempotency_response" is not null
			));--> statement-breakpoint
ALTER TABLE "presigned_uploads" ADD CONSTRAINT "presigned_uploads_idempotency_key_scoped" CHECK ("presigned_uploads"."idempotency_key" is null or "presigned_uploads"."api_key_id" is not null);