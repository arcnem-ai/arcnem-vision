import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, projects } from "./authSchema";
import { models } from "./projectSchema";

export const tools = pgTable(
	"tools",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		name: text().notNull(),
		description: text().notNull(),
		inputSchema: jsonb().notNull(),
		outputSchema: jsonb().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [uniqueIndex("tools_name_uidx").on(t.name)],
);

export const agentGraphTemplates = pgTable(
	"agent_graph_templates",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		visibility: text().notNull(),
		organizationId: uuid("organization_id").references(() => organizations.id),
		currentVersionId: uuid("current_version_id").references(
			(): AnyPgColumn => agentGraphTemplateVersions.id,
		),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		index("agent_graph_templates_organization_id_idx").on(t.organizationId),
		index("agent_graph_templates_organization_archived_at_idx").on(
			t.organizationId,
			t.archivedAt,
		),
		index("agent_graph_templates_current_version_id_idx").on(
			t.currentVersionId,
		),
		index("agent_graph_templates_visibility_archived_at_idx").on(
			t.visibility,
			t.archivedAt,
		),
	],
);

export const agentGraphTemplateVersions = pgTable(
	"agent_graph_template_versions",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		agentGraphTemplateId: uuid("agent_graph_template_id")
			.notNull()
			.references((): AnyPgColumn => agentGraphTemplates.id, {
				onDelete: "cascade",
			}),
		version: integer().notNull(),
		snapshot: jsonb().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("agent_graph_template_versions_template_version_uidx").on(
			t.agentGraphTemplateId,
			t.version,
		),
		index("agent_graph_template_versions_template_id_idx").on(
			t.agentGraphTemplateId,
		),
	],
);

export const agentGraphs = pgTable(
	"agent_graphs",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		name: text().notNull(),
		description: text(),
		entryNode: text().notNull(),
		stateSchema: jsonb(),
		agentGraphTemplateId: uuid("agent_graph_template_id").references(
			() => agentGraphTemplates.id,
		),
		agentGraphTemplateVersionId: uuid(
			"agent_graph_template_version_id",
		).references(() => agentGraphTemplateVersions.id),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, {
				onDelete: "cascade",
			}),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		index("agent_graphs_organization_id_idx").on(t.organizationId),
		index("agent_graphs_organization_archived_at_idx").on(
			t.organizationId,
			t.archivedAt,
		),
		index("agent_graphs_template_id_idx").on(t.agentGraphTemplateId),
		index("agent_graphs_template_version_id_idx").on(
			t.agentGraphTemplateVersionId,
		),
	],
);

export const agentGraphNodes = pgTable(
	"agent_graph_nodes",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		nodeKey: text().notNull(),
		nodeType: text().notNull(),
		inputKey: text(),
		outputKey: text(),
		config: jsonb().notNull().default("{}"),
		agentGraphId: uuid("agent_graph_id")
			.notNull()
			.references(() => agentGraphs.id, { onDelete: "cascade" }),
		modelId: uuid("model_id").references(() => models.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		unique().on(t.agentGraphId, t.nodeKey),
		index("agent_graph_nodes_model_id_idx").on(t.modelId),
	],
);

export const agentGraphNodeTools = pgTable(
	"agent_graph_node_tools",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		agentGraphNodeId: uuid("agent_graph_node_id")
			.notNull()
			.references(() => agentGraphNodes.id, { onDelete: "cascade" }),
		toolId: uuid("tool_id")
			.notNull()
			.references(() => tools.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		unique("agent_graph_node_tools_node_tool_unique").on(
			t.agentGraphNodeId,
			t.toolId,
		),
		index("agent_graph_node_tools_graph_node_id_idx").on(t.agentGraphNodeId),
		index("agent_graph_node_tools_tool_id_idx").on(t.toolId),
	],
);

export const agentGraphEdges = pgTable(
	"agent_graph_edges",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		fromNode: text().notNull(),
		toNode: text().notNull(),
		agentGraphId: uuid("agent_graph_id")
			.notNull()
			.references(() => agentGraphs.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		uniqueIndex("agent_graph_edges_graph_from_to_uidx").on(
			t.agentGraphId,
			t.fromNode,
			t.toNode,
		),
		index("agent_graph_edges_graph_id_idx").on(t.agentGraphId),
		index("agent_graph_edges_graph_from_node_idx").on(
			t.agentGraphId,
			t.fromNode,
		),
		index("agent_graph_edges_graph_to_node_idx").on(t.agentGraphId, t.toNode),
		check("agent_graph_edges_from_not_end", sql`${t.fromNode} <> 'END'`),
		check("agent_graph_edges_no_self_ref", sql`${t.fromNode} <> ${t.toNode}`),
	],
);

export const agentGraphRuns = pgTable(
	"agent_graph_runs",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		agentGraphId: uuid("agent_graph_id")
			.notNull()
			.references(() => agentGraphs.id, { onDelete: "cascade" }),
		projectId: uuid("project_id").references(() => projects.id, {
			onDelete: "set null",
		}),
		status: text().notNull().default("running"),
		initialState: jsonb("initial_state"),
		finalState: jsonb("final_state"),
		error: text(),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		finishedAt: timestamp("finished_at"),
	},
	(t) => [
		index("agent_graph_runs_graph_id_idx").on(t.agentGraphId),
		index("agent_graph_runs_project_id_idx").on(t.projectId),
		index("agent_graph_runs_status_idx").on(t.status),
		check(
			"agent_graph_runs_status_known",
			sql`${t.status} in ('running', 'completed', 'failed')`,
		),
		check(
			"agent_graph_runs_finished_after_started",
			sql`${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt}`,
		),
	],
);

export const agentGraphRunSteps = pgTable(
	"agent_graph_run_steps",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		runId: uuid("run_id")
			.notNull()
			.references(() => agentGraphRuns.id, { onDelete: "cascade" }),
		nodeKey: text().notNull(),
		stepOrder: integer("step_order").notNull(),
		stateDelta: jsonb("state_delta"),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		finishedAt: timestamp("finished_at"),
	},
	(t) => [
		uniqueIndex("agent_graph_run_steps_run_id_step_order_uidx").on(
			t.runId,
			t.stepOrder,
		),
		index("agent_graph_run_steps_run_id_idx").on(t.runId),
		index("agent_graph_run_steps_run_id_order_idx").on(t.runId, t.stepOrder),
		check("agent_graph_run_steps_step_order_positive", sql`${t.stepOrder} > 0`),
		check(
			"agent_graph_run_steps_finished_after_started",
			sql`${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt}`,
		),
	],
);
