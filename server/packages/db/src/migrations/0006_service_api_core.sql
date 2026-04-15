ALTER TABLE "apikeys" ALTER COLUMN "device_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "apikeys" ADD COLUMN "kind" text DEFAULT 'device' NOT NULL;--> statement-breakpoint
ALTER TABLE "presigned_uploads" ADD COLUMN "visibility" text DEFAULT 'org' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD CONSTRAINT "agent_graph_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_graph_runs_project_id_idx" ON "agent_graph_runs" USING btree ("project_id");