import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { agentGraphs } from "./agentGraphSchemas";

export const users = pgTable("users", {
	id: uuid("id").primaryKey().default(sql`uuidv7()`),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	role: text("role"),
	banned: boolean("banned").default(false).notNull(),
	banReason: text("ban_reason"),
	banExpires: timestamp("ban_expires"),
});

export const accounts = pgTable(
	"accounts",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("accounts_providerId_accountId_uidx").on(
			table.providerId,
			table.accountId,
		),
		index("accounts_userId_idx").on(table.userId),
	],
);

export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		activeOrganizationId: uuid("active_organization_id").references(
			() => organizations.id,
			{ onDelete: "set null" },
		),
		impersonatedBy: uuid("impersonated_by"),
	},
	(table) => [
		index("sessions_userId_idx").on(table.userId),
		index("sessions_token_idx").on(table.token),
		index("sessions_activeOrganizationId_idx").on(table.activeOrganizationId),
		index("sessions_expiresAt_idx").on(table.expiresAt),
	],
);

export const verifications = pgTable(
	"verifications",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("verifications_identifier_value_uidx").on(
			table.identifier,
			table.value,
		),
		index("verifications_identifier_idx").on(table.identifier),
	],
);

export const apikeys = pgTable(
	"apikeys",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		name: text("name"),
		start: text("start"),
		prefix: text("prefix"),
		key: text("key").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		deviceId: uuid(`device_id`)
			.notNull()
			.references(() => devices.id),
		refillInterval: integer("refill_interval"),
		refillAmount: integer("refill_amount"),
		lastRefillAt: timestamp("last_refill_at"),
		enabled: boolean("enabled").default(true).notNull(),
		rateLimitEnabled: boolean("rate_limit_enabled").default(true).notNull(),
		rateLimitTimeWindow: integer("rate_limit_time_window")
			.default(86400000)
			.notNull(),
		rateLimitMax: integer("rate_limit_max").default(10).notNull(),
		requestCount: integer("request_count").default(0).notNull(),
		remaining: integer("remaining"),
		lastRequest: timestamp("last_request"),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		uniqueIndex("apikeys_key_uidx").on(table.key),
		index("apikeys_userId_idx").on(table.userId),
		index("apikeys_deviceId_idx").on(table.deviceId),
		index("apikeys_organizationId_idx").on(table.organizationId),
		index("apikeys_projectId_idx").on(table.projectId),
		check(
			"apikeys_rate_limit_time_window_positive",
			sql`${table.rateLimitTimeWindow} > 0`,
		),
		check(
			"apikeys_rate_limit_max_non_negative",
			sql`${table.rateLimitMax} >= 0`,
		),
		check(
			"apikeys_request_count_non_negative",
			sql`${table.requestCount} >= 0`,
		),
		check(
			"apikeys_remaining_non_negative",
			sql`${table.remaining} is null or ${table.remaining} >= 0`,
		),
	],
);

export const organizations = pgTable(
	"organizations",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		metadata: text("metadata"),
	},
	(table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)],
);

export const members = pgTable(
	"members",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("members_organizationId_userId_uidx").on(
			table.organizationId,
			table.userId,
		),
		index("members_organizationId_idx").on(table.organizationId),
		index("members_userId_idx").on(table.userId),
	],
);

export const invitations = pgTable(
	"invitations",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		inviterId: uuid("inviter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitations_organizationId_idx").on(table.organizationId),
		index("invitations_email_idx").on(table.email),
		index("invitations_organizationId_email_idx").on(
			table.organizationId,
			table.email,
		),
	],
);

export const projects = pgTable(
	"projects",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("projects_organizationId_slug_uidx").on(
			table.organizationId,
			table.slug,
		),
		index("projects_organizationId_idx").on(table.organizationId),
	],
);

export const devices = pgTable(
	"devices",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		agentGraphId: uuid("agent_graph_id")
			.notNull()
			.references(() => agentGraphs.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("devices_projectId_slug_uidx").on(table.projectId, table.slug),
		index("devices_organizationId_idx").on(table.organizationId),
		index("devices_projectId_idx").on(table.projectId),
	],
);
