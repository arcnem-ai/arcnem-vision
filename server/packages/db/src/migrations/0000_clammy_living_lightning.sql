CREATE EXTENSION IF NOT EXISTS "vector";
--> statement-breakpoint
CREATE TABLE "agent_graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"from_node" text NOT NULL,
	"to_node" text NOT NULL,
	"agent_graph_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_graph_edges_from_not_end" CHECK ("agent_graph_edges"."from_node" <> 'END'),
	CONSTRAINT "agent_graph_edges_no_self_ref" CHECK ("agent_graph_edges"."from_node" <> "agent_graph_edges"."to_node")
);
--> statement-breakpoint
CREATE TABLE "agent_graph_node_tools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"agent_graph_node_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_graph_node_tools_node_tool_unique" UNIQUE("agent_graph_node_id","tool_id")
);
--> statement-breakpoint
CREATE TABLE "agent_graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"node_key" text NOT NULL,
	"node_type" text NOT NULL,
	"input_key" text,
	"output_key" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"agent_graph_id" uuid NOT NULL,
	"model_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_graph_nodes_agent_graph_id_nodeKey_unique" UNIQUE("agent_graph_id","node_key"),
	CONSTRAINT "agent_graph_nodes_node_type_known" CHECK ("agent_graph_nodes"."node_type" in ('worker', 'supervisor', 'tool'))
);
--> statement-breakpoint
CREATE TABLE "agent_graph_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"step_order" integer NOT NULL,
	"state_delta" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "agent_graph_run_steps_step_order_positive" CHECK ("agent_graph_run_steps"."step_order" > 0),
	CONSTRAINT "agent_graph_run_steps_finished_after_started" CHECK ("agent_graph_run_steps"."finished_at" is null or "agent_graph_run_steps"."finished_at" >= "agent_graph_run_steps"."started_at")
);
--> statement-breakpoint
CREATE TABLE "agent_graph_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"agent_graph_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"initial_state" jsonb,
	"final_state" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "agent_graph_runs_status_known" CHECK ("agent_graph_runs"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "agent_graph_runs_finished_after_started" CHECK ("agent_graph_runs"."finished_at" is null or "agent_graph_runs"."finished_at" >= "agent_graph_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "agent_graph_template_edges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"from_node" text NOT NULL,
	"to_node" text NOT NULL,
	"agent_graph_template_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_graph_template_edges_from_not_end" CHECK ("agent_graph_template_edges"."from_node" <> 'END'),
	CONSTRAINT "agent_graph_template_edges_no_self_ref" CHECK ("agent_graph_template_edges"."from_node" <> "agent_graph_template_edges"."to_node")
);
--> statement-breakpoint
CREATE TABLE "agent_graph_template_node_tools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"agent_graph_template_node_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_graph_template_node_tools_node_tool_unique" UNIQUE("agent_graph_template_node_id","tool_id")
);
--> statement-breakpoint
CREATE TABLE "agent_graph_template_nodes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"node_key" text NOT NULL,
	"node_type" text NOT NULL,
	"input_key" text,
	"output_key" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"agent_graph_template_id" uuid NOT NULL,
	"model_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_graph_template_nodes_agent_graph_template_id_nodeKey_unique" UNIQUE("agent_graph_template_id","node_key"),
	CONSTRAINT "agent_graph_template_nodes_node_type_known" CHECK ("agent_graph_template_nodes"."node_type" in ('worker', 'supervisor', 'tool'))
);
--> statement-breakpoint
CREATE TABLE "agent_graph_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"visibility" text NOT NULL,
	"entry_node" text NOT NULL,
	"state_schema" jsonb,
	"organization_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_graphs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"entry_node" text NOT NULL,
	"state_schema" jsonb,
	"agent_graph_template_id" uuid,
	"agent_graph_template_version" integer,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikeys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_time_window" integer DEFAULT 86400000 NOT NULL,
	"rate_limit_max" integer DEFAULT 10 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"permissions" text,
	"metadata" text,
	CONSTRAINT "apikeys_rate_limit_time_window_positive" CHECK ("apikeys"."rate_limit_time_window" > 0),
	CONSTRAINT "apikeys_rate_limit_max_non_negative" CHECK ("apikeys"."rate_limit_max" >= 0),
	CONSTRAINT "apikeys_request_count_non_negative" CHECK ("apikeys"."request_count" >= 0),
	CONSTRAINT "apikeys_remaining_non_negative" CHECK ("apikeys"."remaining" is null or "apikeys"."remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_graph_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"metadata" text,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"active_organization_id" uuid,
	"impersonated_by" uuid,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_description_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_description_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"embedding_dim" integer DEFAULT 768 NOT NULL,
	"embedding" vector NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_description_embeddings_embedding_dim_matches_vector" CHECK (vector_dims("document_description_embeddings"."embedding") = "document_description_embeddings"."embedding_dim"),
	CONSTRAINT "document_description_embeddings_embedding_dim_positive" CHECK ("document_description_embeddings"."embedding_dim" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"embedding_dim" integer DEFAULT 768 NOT NULL,
	"embedding" vector NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_embeddings_embedding_dim_matches_vector" CHECK (vector_dims("document_embeddings"."embedding") = "document_embeddings"."embedding_dim"),
	CONSTRAINT "document_embeddings_embedding_dim_positive" CHECK ("document_embeddings"."embedding_dim" > 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"etag" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"last_modified_at" timestamp NOT NULL,
	"visibility" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documents_size_bytes_positive" CHECK ("documents"."size_bytes" > 0),
	CONSTRAINT "documents_visibility_known" CHECK ("documents"."visibility" in ('org', 'private', 'public'))
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"embedding_dim" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "models_embedding_dim_positive" CHECK ("models"."embedding_dim" > 0)
);
--> statement-breakpoint
CREATE TABLE "presigned_uploads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"device_id" uuid NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "presigned_uploads_status_known" CHECK ("presigned_uploads"."status" in ('issued', 'verified'))
);
--> statement-breakpoint
ALTER TABLE "agent_graph_edges" ADD CONSTRAINT "agent_graph_edges_agent_graph_id_agent_graphs_id_fk" FOREIGN KEY ("agent_graph_id") REFERENCES "public"."agent_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_node_tools" ADD CONSTRAINT "agent_graph_node_tools_agent_graph_node_id_agent_graph_nodes_id_fk" FOREIGN KEY ("agent_graph_node_id") REFERENCES "public"."agent_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_node_tools" ADD CONSTRAINT "agent_graph_node_tools_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_nodes" ADD CONSTRAINT "agent_graph_nodes_agent_graph_id_agent_graphs_id_fk" FOREIGN KEY ("agent_graph_id") REFERENCES "public"."agent_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_nodes" ADD CONSTRAINT "agent_graph_nodes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_run_steps" ADD CONSTRAINT "agent_graph_run_steps_run_id_agent_graph_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_graph_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_runs" ADD CONSTRAINT "agent_graph_runs_agent_graph_id_agent_graphs_id_fk" FOREIGN KEY ("agent_graph_id") REFERENCES "public"."agent_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_template_edges" ADD CONSTRAINT "agent_graph_template_edges_agent_graph_template_id_agent_graph_templates_id_fk" FOREIGN KEY ("agent_graph_template_id") REFERENCES "public"."agent_graph_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_template_node_tools" ADD CONSTRAINT "agent_graph_template_node_tools_agent_graph_template_node_id_agent_graph_template_nodes_id_fk" FOREIGN KEY ("agent_graph_template_node_id") REFERENCES "public"."agent_graph_template_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_template_node_tools" ADD CONSTRAINT "agent_graph_template_node_tools_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_template_nodes" ADD CONSTRAINT "agent_graph_template_nodes_agent_graph_template_id_agent_graph_templates_id_fk" FOREIGN KEY ("agent_graph_template_id") REFERENCES "public"."agent_graph_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_template_nodes" ADD CONSTRAINT "agent_graph_template_nodes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graph_templates" ADD CONSTRAINT "agent_graph_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graphs" ADD CONSTRAINT "agent_graphs_agent_graph_template_id_agent_graph_templates_id_fk" FOREIGN KEY ("agent_graph_template_id") REFERENCES "public"."agent_graph_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_graphs" ADD CONSTRAINT "agent_graphs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikeys" ADD CONSTRAINT "apikeys_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_agent_graph_id_agent_graphs_id_fk" FOREIGN KEY ("agent_graph_id") REFERENCES "public"."agent_graphs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_organization_id_organizations_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_description_embeddings" ADD CONSTRAINT "document_description_embeddings_document_description_id_document_descriptions_id_fk" FOREIGN KEY ("document_description_id") REFERENCES "public"."document_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_description_embeddings" ADD CONSTRAINT "document_description_embeddings_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_descriptions" ADD CONSTRAINT "document_descriptions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_descriptions" ADD CONSTRAINT "document_descriptions_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embeddings" ADD CONSTRAINT "document_embeddings_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presigned_uploads" ADD CONSTRAINT "presigned_uploads_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_graph_edges_graph_from_to_uidx" ON "agent_graph_edges" USING btree ("agent_graph_id","from_node","to_node");--> statement-breakpoint
CREATE INDEX "agent_graph_edges_graph_id_idx" ON "agent_graph_edges" USING btree ("agent_graph_id");--> statement-breakpoint
CREATE INDEX "agent_graph_edges_graph_from_node_idx" ON "agent_graph_edges" USING btree ("agent_graph_id","from_node");--> statement-breakpoint
CREATE INDEX "agent_graph_edges_graph_to_node_idx" ON "agent_graph_edges" USING btree ("agent_graph_id","to_node");--> statement-breakpoint
CREATE INDEX "agent_graph_node_tools_graph_node_id_idx" ON "agent_graph_node_tools" USING btree ("agent_graph_node_id");--> statement-breakpoint
CREATE INDEX "agent_graph_node_tools_tool_id_idx" ON "agent_graph_node_tools" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "agent_graph_nodes_model_id_idx" ON "agent_graph_nodes" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_graph_run_steps_run_id_step_order_uidx" ON "agent_graph_run_steps" USING btree ("run_id","step_order");--> statement-breakpoint
CREATE INDEX "agent_graph_run_steps_run_id_idx" ON "agent_graph_run_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_graph_run_steps_run_id_order_idx" ON "agent_graph_run_steps" USING btree ("run_id","step_order");--> statement-breakpoint
CREATE INDEX "agent_graph_runs_graph_id_idx" ON "agent_graph_runs" USING btree ("agent_graph_id");--> statement-breakpoint
CREATE INDEX "agent_graph_runs_status_idx" ON "agent_graph_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_graph_template_edges_graph_from_to_uidx" ON "agent_graph_template_edges" USING btree ("agent_graph_template_id","from_node","to_node");--> statement-breakpoint
CREATE INDEX "agent_graph_template_edges_template_id_idx" ON "agent_graph_template_edges" USING btree ("agent_graph_template_id");--> statement-breakpoint
CREATE INDEX "agent_graph_template_edges_template_from_node_idx" ON "agent_graph_template_edges" USING btree ("agent_graph_template_id","from_node");--> statement-breakpoint
CREATE INDEX "agent_graph_template_edges_template_to_node_idx" ON "agent_graph_template_edges" USING btree ("agent_graph_template_id","to_node");--> statement-breakpoint
CREATE INDEX "agent_graph_template_node_tools_template_node_id_idx" ON "agent_graph_template_node_tools" USING btree ("agent_graph_template_node_id");--> statement-breakpoint
CREATE INDEX "agent_graph_template_node_tools_tool_id_idx" ON "agent_graph_template_node_tools" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "agent_graph_template_nodes_model_id_idx" ON "agent_graph_template_nodes" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "agent_graph_templates_organization_id_idx" ON "agent_graph_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_graphs_organization_id_idx" ON "agent_graphs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_graphs_template_id_idx" ON "agent_graphs" USING btree ("agent_graph_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_name_uidx" ON "tools" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_providerId_accountId_uidx" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apikeys_key_uidx" ON "apikeys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "apikeys_userId_idx" ON "apikeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikeys_deviceId_idx" ON "apikeys" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "apikeys_organizationId_idx" ON "apikeys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "apikeys_projectId_idx" ON "apikeys" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_projectId_slug_uidx" ON "devices" USING btree ("project_id","slug");--> statement-breakpoint
CREATE INDEX "devices_organizationId_idx" ON "devices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "devices_projectId_idx" ON "devices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "invitations_organizationId_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_organizationId_email_idx" ON "invitations" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "members_organizationId_userId_uidx" ON "members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "members_organizationId_idx" ON "members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "members_userId_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uidx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organizationId_slug_uidx" ON "projects" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "projects_organizationId_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_activeOrganizationId_idx" ON "sessions" USING btree ("active_organization_id");--> statement-breakpoint
CREATE INDEX "sessions_expiresAt_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "verifications_identifier_value_uidx" ON "verifications" USING btree ("identifier","value");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "document_description_embeddings_description_model_id_embedding_dim_unique" ON "document_description_embeddings" USING btree ("document_description_id","model_id","embedding_dim");--> statement-breakpoint
CREATE INDEX "document_description_embeddings_model_id_embedding_dim_idx" ON "document_description_embeddings" USING btree ("model_id","embedding_dim");--> statement-breakpoint
CREATE INDEX "document_description_embeddings_embedding_cosine_768_idx" ON "document_description_embeddings" USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE "document_description_embeddings"."embedding_dim" = 768;--> statement-breakpoint
CREATE INDEX "document_description_embeddings_embedding_cosine_1536_idx" ON "document_description_embeddings" USING hnsw ((embedding::vector(1536)) vector_cosine_ops) WHERE "document_description_embeddings"."embedding_dim" = 1536;--> statement-breakpoint
CREATE UNIQUE INDEX "document_descriptions_document_model_id_unique" ON "document_descriptions" USING btree ("document_id","model_id");--> statement-breakpoint
CREATE INDEX "document_descriptions_model_id_idx" ON "document_descriptions" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_embeddings_document_model_id_embedding_dim_unique" ON "document_embeddings" USING btree ("document_id","model_id","embedding_dim");--> statement-breakpoint
CREATE INDEX "document_embeddings_model_id_embedding_dim_idx" ON "document_embeddings" USING btree ("model_id","embedding_dim");--> statement-breakpoint
CREATE INDEX "document_embeddings_embedding_cosine_768_idx" ON "document_embeddings" USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE "document_embeddings"."embedding_dim" = 768;--> statement-breakpoint
CREATE INDEX "document_embeddings_embedding_cosine_1536_idx" ON "document_embeddings" USING hnsw ((embedding::vector(1536)) vector_cosine_ops) WHERE "document_embeddings"."embedding_dim" = 1536;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_bucket_object_key_uidx" ON "documents" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE INDEX "documents_organization_id_idx" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "documents_organization_id_id_idx" ON "documents" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "documents_project_id_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_device_id_idx" ON "documents" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "documents_device_id_id_idx" ON "documents" USING btree ("device_id","id");--> statement-breakpoint
CREATE INDEX "documents_device_created_at_idx" ON "documents" USING btree ("device_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "models_provider_name_unique" ON "models" USING btree ("provider","name");--> statement-breakpoint
CREATE UNIQUE INDEX "presigned_uploads_object_key_device_uidx" ON "presigned_uploads" USING btree ("object_key","device_id");--> statement-breakpoint
CREATE INDEX "presigned_uploads_status_created_at_idx" ON "presigned_uploads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "presigned_uploads_device_status_idx" ON "presigned_uploads" USING btree ("device_id","status");
