CREATE TABLE "agent_graph_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"agent_graph_template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_graph_template_edges" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_graph_template_node_tools" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_graph_template_nodes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_graph_template_edges" CASCADE;--> statement-breakpoint
DROP TABLE "agent_graph_template_node_tools" CASCADE;--> statement-breakpoint
DROP TABLE "agent_graph_template_nodes" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_graph_templates" ADD COLUMN "current_version_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_graphs" ADD COLUMN "agent_graph_template_version_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_graph_template_versions" ADD CONSTRAINT "agent_graph_template_versions_agent_graph_template_id_agent_graph_templates_id_fk" FOREIGN KEY ("agent_graph_template_id") REFERENCES "public"."agent_graph_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_graph_template_versions_template_version_uidx" ON "agent_graph_template_versions" USING btree ("agent_graph_template_id","version");--> statement-breakpoint
CREATE INDEX "agent_graph_template_versions_template_id_idx" ON "agent_graph_template_versions" USING btree ("agent_graph_template_id");--> statement-breakpoint
ALTER TABLE "agent_graph_templates" ADD CONSTRAINT "agent_graph_templates_current_version_id_agent_graph_template_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."agent_graph_template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graphs" ADD CONSTRAINT "agent_graphs_agent_graph_template_version_id_agent_graph_template_versions_id_fk" FOREIGN KEY ("agent_graph_template_version_id") REFERENCES "public"."agent_graph_template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_graph_templates_current_version_id_idx" ON "agent_graph_templates" USING btree ("current_version_id");--> statement-breakpoint
CREATE INDEX "agent_graphs_template_version_id_idx" ON "agent_graphs" USING btree ("agent_graph_template_version_id");--> statement-breakpoint
ALTER TABLE "agent_graph_templates" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "agent_graph_templates" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "agent_graph_templates" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "agent_graph_templates" DROP COLUMN "entry_node";--> statement-breakpoint
ALTER TABLE "agent_graph_templates" DROP COLUMN "state_schema";--> statement-breakpoint
ALTER TABLE "agent_graphs" DROP COLUMN "agent_graph_template_version";