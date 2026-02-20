import { sql } from "drizzle-orm";
import {
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
import { organizations } from "./authSchema";
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
		name: text().notNull(),
		description: text(),
		version: integer().notNull().default(1),
		visibility: text().notNull(),
		entryNode: text().notNull(),
		stateSchema: jsonb(),
		organizationId: uuid("organization_id").references(() => organizations.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		index("agent_graph_templates_organization_id_idx").on(t.organizationId),
	],
);

export const agentGraphTemplateNodes = pgTable(
	"agent_graph_template_nodes",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		nodeKey: text().notNull(),
		nodeType: text().notNull(),
		inputKey: text(),
		outputKey: text(),
		config: jsonb().notNull().default("{}"),
		agentGraphTemplateId: uuid("agent_graph_template_id")
			.notNull()
			.references(() => agentGraphTemplates.id, { onDelete: "cascade" }),
		modelId: uuid("model_id").references(() => models.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		unique().on(t.agentGraphTemplateId, t.nodeKey),
		index("agent_graph_template_nodes_model_id_idx").on(t.modelId),
		check(
			"agent_graph_template_nodes_node_type_known",
			sql`${t.nodeType} in ('worker', 'supervisor', 'tool')`,
		),
	],
);

export const agentGraphTemplateNodeTools = pgTable(
	"agent_graph_template_node_tools",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		agentGraphTemplateNodeId: uuid("agent_graph_template_node_id")
			.notNull()
			.references(() => agentGraphTemplateNodes.id, { onDelete: "cascade" }),
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
		unique("agent_graph_template_node_tools_node_tool_unique").on(
			t.agentGraphTemplateNodeId,
			t.toolId,
		),
		index("agent_graph_template_node_tools_template_node_id_idx").on(
			t.agentGraphTemplateNodeId,
		),
		index("agent_graph_template_node_tools_tool_id_idx").on(t.toolId),
	],
);

export const agentGraphTemplateEdges = pgTable(
	"agent_graph_template_edges",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		fromNode: text().notNull(),
		toNode: text().notNull(),
		agentGraphTemplateId: uuid("agent_graph_template_id")
			.notNull()
			.references(() => agentGraphTemplates.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		uniqueIndex("agent_graph_template_edges_graph_from_to_uidx").on(
			t.agentGraphTemplateId,
			t.fromNode,
			t.toNode,
		),
		index("agent_graph_template_edges_template_id_idx").on(
			t.agentGraphTemplateId,
		),
		index("agent_graph_template_edges_template_from_node_idx").on(
			t.agentGraphTemplateId,
			t.fromNode,
		),
		index("agent_graph_template_edges_template_to_node_idx").on(
			t.agentGraphTemplateId,
			t.toNode,
		),
		check(
			"agent_graph_template_edges_from_not_end",
			sql`${t.fromNode} <> 'END'`,
		),
		check(
			"agent_graph_template_edges_no_self_ref",
			sql`${t.fromNode} <> ${t.toNode}`,
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
		agentGraphTemplateVersion: integer(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, {
				onDelete: "cascade",
			}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		index("agent_graphs_organization_id_idx").on(t.organizationId),
		index("agent_graphs_template_id_idx").on(t.agentGraphTemplateId),
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
		check(
			"agent_graph_nodes_node_type_known",
			sql`${t.nodeType} in ('worker', 'supervisor', 'tool')`,
		),
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
		status: text().notNull().default("running"),
		initialState: jsonb("initial_state"),
		finalState: jsonb("final_state"),
		error: text(),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		finishedAt: timestamp("finished_at"),
	},
	(t) => [
		index("agent_graph_runs_graph_id_idx").on(t.agentGraphId),
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
