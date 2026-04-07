ALTER TABLE "devices" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX "devices_organizationId_archivedAt_idx" ON "devices" USING btree ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "projects_organizationId_archivedAt_idx" ON "projects" USING btree ("organization_id","archived_at");