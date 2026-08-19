ALTER TABLE "agent_graph_runs" ADD COLUMN "graph_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD COLUMN "graph_snapshot_hash" text;