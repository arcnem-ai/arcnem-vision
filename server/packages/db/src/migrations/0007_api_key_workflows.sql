ALTER TABLE "apikeys" DROP CONSTRAINT IF EXISTS "apikeys_device_id_devices_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "apikeys_deviceId_idx";--> statement-breakpoint
ALTER TABLE "apikeys" ADD COLUMN "agent_graph_id" uuid;--> statement-breakpoint
ALTER TABLE "apikeys" ALTER COLUMN "kind" SET DEFAULT 'workflow';--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_agent_graph_id_agent_graphs_id_fk" FOREIGN KEY ("agent_graph_id") REFERENCES "public"."agent_graphs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apikeys_agentGraphId_idx" ON "apikeys" USING btree ("agent_graph_id");--> statement-breakpoint
ALTER TABLE "apikeys" DROP COLUMN IF EXISTS "device_id";--> statement-breakpoint

ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_device_id_devices_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "documents_device_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "documents_device_id_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "documents_device_created_at_idx";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_api_key_id_apikeys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_api_key_id_idx" ON "documents" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "documents_api_key_id_id_idx" ON "documents" USING btree ("api_key_id","id");--> statement-breakpoint
CREATE INDEX "documents_api_key_created_at_idx" ON "documents" USING btree ("api_key_id","created_at");--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "device_id";--> statement-breakpoint

ALTER TABLE "presigned_uploads" DROP CONSTRAINT IF EXISTS "presigned_uploads_device_id_devices_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "presigned_uploads_object_key_device_uidx";--> statement-breakpoint
DROP INDEX IF EXISTS "presigned_uploads_device_status_idx";--> statement-breakpoint
ALTER TABLE "presigned_uploads" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "presigned_uploads" ADD CONSTRAINT "presigned_uploads_api_key_id_apikeys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikeys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presigned_uploads_api_key_status_idx" ON "presigned_uploads" USING btree ("api_key_id","status");--> statement-breakpoint
ALTER TABLE "presigned_uploads" DROP COLUMN IF EXISTS "device_id";--> statement-breakpoint

DROP TABLE IF EXISTS "devices";--> statement-breakpoint
