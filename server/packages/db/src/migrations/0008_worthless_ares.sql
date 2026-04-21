ALTER TABLE "agent_graph_templates" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "agent_graphs" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX "agent_graph_templates_organization_archived_at_idx" ON "agent_graph_templates" USING btree ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "agent_graph_templates_visibility_archived_at_idx" ON "agent_graph_templates" USING btree ("visibility","archived_at");--> statement-breakpoint
CREATE INDEX "agent_graphs_organization_archived_at_idx" ON "agent_graphs" USING btree ("organization_id","archived_at");
