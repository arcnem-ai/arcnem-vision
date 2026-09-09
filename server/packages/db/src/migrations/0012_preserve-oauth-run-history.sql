ALTER TABLE "agent_graph_runs" DROP CONSTRAINT "agent_graph_runs_idempotency_fields_together";--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD CONSTRAINT "agent_graph_runs_idempotency_fields_together" CHECK ((
				"agent_graph_runs"."idempotency_key" is null and
				"agent_graph_runs"."api_key_id" is null and
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