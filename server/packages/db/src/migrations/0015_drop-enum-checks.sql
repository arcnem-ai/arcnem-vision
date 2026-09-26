ALTER TABLE "agent_graph_runs" DROP CONSTRAINT "agent_graph_runs_status_known";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_visibility_known";--> statement-breakpoint
ALTER TABLE "presigned_uploads" DROP CONSTRAINT "presigned_uploads_status_known";