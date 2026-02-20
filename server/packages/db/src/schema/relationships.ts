import { relations } from "drizzle-orm";
import {
	agentGraphEdges,
	agentGraphNodes,
	agentGraphNodeTools,
	agentGraphRunSteps,
	agentGraphRuns,
	agentGraphs,
	agentGraphTemplateEdges,
	agentGraphTemplateNodes,
	agentGraphTemplateNodeTools,
	agentGraphTemplates,
	tools,
} from "./agentGraphSchemas";
import {
	accounts,
	apikeys,
	devices,
	invitations,
	members,
	organizations,
	projects,
	sessions,
	users,
} from "./authSchema";
import {
	documentDescriptionEmbeddings,
	documentDescriptions,
	documentEmbeddings,
	documents,
	models,
	presignedUploads,
} from "./projectSchema";

export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
	apikeys: many(apikeys),
	members: many(members),
	invitations: many(invitations),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	users: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	users: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
	organizations: one(organizations, {
		fields: [sessions.activeOrganizationId],
		references: [organizations.id],
	}),
}));

export const apikeysRelations = relations(apikeys, ({ one }) => ({
	users: one(users, {
		fields: [apikeys.userId],
		references: [users.id],
	}),
	organizations: one(organizations, {
		fields: [apikeys.organizationId],
		references: [organizations.id],
	}),
	projects: one(projects, {
		fields: [apikeys.projectId],
		references: [projects.id],
	}),
	devices: one(devices, {
		fields: [apikeys.deviceId],
		references: [devices.id],
	}),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(members),
	invitations: many(invitations),
	projects: many(projects),
	devices: many(devices),
	documents: many(documents),
	agentGraphTemplates: many(agentGraphTemplates),
	agentGraphs: many(agentGraphs),
}));

export const membersRelations = relations(members, ({ one }) => ({
	organizations: one(organizations, {
		fields: [members.organizationId],
		references: [organizations.id],
	}),
	users: one(users, {
		fields: [members.userId],
		references: [users.id],
	}),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
	organizations: one(organizations, {
		fields: [invitations.organizationId],
		references: [organizations.id],
	}),
	users: one(users, {
		fields: [invitations.inviterId],
		references: [users.id],
	}),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
	organizations: one(organizations, {
		fields: [projects.organizationId],
		references: [organizations.id],
	}),
	devices: many(devices),
	apikeys: many(apikeys),
	documents: many(documents),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
	organizations: one(organizations, {
		fields: [devices.organizationId],
		references: [organizations.id],
	}),
	projects: one(projects, {
		fields: [devices.projectId],
		references: [projects.id],
	}),
	agentGraphs: one(agentGraphs, {
		fields: [devices.agentGraphId],
		references: [agentGraphs.id],
	}),
	apikeys: many(apikeys),
	documents: many(documents),
	presignedUploads: many(presignedUploads),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
	organizations: one(organizations, {
		fields: [documents.organizationId],
		references: [organizations.id],
	}),
	projects: one(projects, {
		fields: [documents.projectId],
		references: [projects.id],
	}),
	devices: one(devices, {
		fields: [documents.deviceId],
		references: [devices.id],
	}),
	documentEmbeddings: many(documentEmbeddings),
	documentDescriptions: many(documentDescriptions),
}));

export const presignedUploadsRelations = relations(
	presignedUploads,
	({ one }) => ({
		devices: one(devices, {
			fields: [presignedUploads.deviceId],
			references: [devices.id],
		}),
	}),
);

export const modelsRelations = relations(models, ({ many }) => ({
	documentEmbeddings: many(documentEmbeddings),
	documentDescriptions: many(documentDescriptions),
	documentDescriptionEmbeddings: many(documentDescriptionEmbeddings),
	agentGraphTemplateNodes: many(agentGraphTemplateNodes),
	agentGraphNodes: many(agentGraphNodes),
}));

export const documentEmbeddingsRelations = relations(
	documentEmbeddings,
	({ one }) => ({
		documents: one(documents, {
			fields: [documentEmbeddings.documentId],
			references: [documents.id],
		}),
		models: one(models, {
			fields: [documentEmbeddings.modelId],
			references: [models.id],
		}),
	}),
);

export const documentDescriptionsRelations = relations(
	documentDescriptions,
	({ one, many }) => ({
		documents: one(documents, {
			fields: [documentDescriptions.documentId],
			references: [documents.id],
		}),
		models: one(models, {
			fields: [documentDescriptions.modelId],
			references: [models.id],
		}),
		documentDescriptionEmbeddings: many(documentDescriptionEmbeddings),
	}),
);

export const documentDescriptionEmbeddingsRelations = relations(
	documentDescriptionEmbeddings,
	({ one }) => ({
		documentDescriptions: one(documentDescriptions, {
			fields: [documentDescriptionEmbeddings.documentDescriptionId],
			references: [documentDescriptions.id],
		}),
		models: one(models, {
			fields: [documentDescriptionEmbeddings.modelId],
			references: [models.id],
		}),
	}),
);

export const toolsRelations = relations(tools, ({ many }) => ({
	agentGraphTemplateNodeTools: many(agentGraphTemplateNodeTools),
	agentGraphNodeTools: many(agentGraphNodeTools),
}));

export const agentGraphTemplatesRelations = relations(
	agentGraphTemplates,
	({ one, many }) => ({
		organizations: one(organizations, {
			fields: [agentGraphTemplates.organizationId],
			references: [organizations.id],
		}),
		agentGraphTemplateNodes: many(agentGraphTemplateNodes),
		agentGraphTemplateEdges: many(agentGraphTemplateEdges),
		agentGraphs: many(agentGraphs),
	}),
);

export const agentGraphTemplateNodesRelations = relations(
	agentGraphTemplateNodes,
	({ one, many }) => ({
		agentGraphTemplates: one(agentGraphTemplates, {
			fields: [agentGraphTemplateNodes.agentGraphTemplateId],
			references: [agentGraphTemplates.id],
		}),
		models: one(models, {
			fields: [agentGraphTemplateNodes.modelId],
			references: [models.id],
		}),
		agentGraphTemplateNodeTools: many(agentGraphTemplateNodeTools),
		fromEdges: many(agentGraphTemplateEdges, {
			relationName: "template_from_node",
		}),
		toEdges: many(agentGraphTemplateEdges, {
			relationName: "template_to_node",
		}),
	}),
);

export const agentGraphTemplateNodeToolsRelations = relations(
	agentGraphTemplateNodeTools,
	({ one }) => ({
		agentGraphTemplateNodes: one(agentGraphTemplateNodes, {
			fields: [agentGraphTemplateNodeTools.agentGraphTemplateNodeId],
			references: [agentGraphTemplateNodes.id],
		}),
		tools: one(tools, {
			fields: [agentGraphTemplateNodeTools.toolId],
			references: [tools.id],
		}),
	}),
);

export const agentGraphTemplateEdgesRelations = relations(
	agentGraphTemplateEdges,
	({ one }) => ({
		agentGraphTemplates: one(agentGraphTemplates, {
			fields: [agentGraphTemplateEdges.agentGraphTemplateId],
			references: [agentGraphTemplates.id],
		}),
		fromNodeRef: one(agentGraphTemplateNodes, {
			relationName: "template_from_node",
			fields: [
				agentGraphTemplateEdges.agentGraphTemplateId,
				agentGraphTemplateEdges.fromNode,
			],
			references: [
				agentGraphTemplateNodes.agentGraphTemplateId,
				agentGraphTemplateNodes.nodeKey,
			],
		}),
		toNodeRef: one(agentGraphTemplateNodes, {
			relationName: "template_to_node",
			fields: [
				agentGraphTemplateEdges.agentGraphTemplateId,
				agentGraphTemplateEdges.toNode,
			],
			references: [
				agentGraphTemplateNodes.agentGraphTemplateId,
				agentGraphTemplateNodes.nodeKey,
			],
		}),
	}),
);

export const agentGraphsRelations = relations(agentGraphs, ({ one, many }) => ({
	organizations: one(organizations, {
		fields: [agentGraphs.organizationId],
		references: [organizations.id],
	}),
	agentGraphTemplates: one(agentGraphTemplates, {
		fields: [agentGraphs.agentGraphTemplateId],
		references: [agentGraphTemplates.id],
	}),
	agentGraphNodes: many(agentGraphNodes),
	agentGraphEdges: many(agentGraphEdges),
	agentGraphRuns: many(agentGraphRuns),
	devices: many(devices),
}));

export const agentGraphNodesRelations = relations(
	agentGraphNodes,
	({ one, many }) => ({
		agentGraphs: one(agentGraphs, {
			fields: [agentGraphNodes.agentGraphId],
			references: [agentGraphs.id],
		}),
		models: one(models, {
			fields: [agentGraphNodes.modelId],
			references: [models.id],
		}),
		agentGraphNodeTools: many(agentGraphNodeTools),
		fromEdges: many(agentGraphEdges, {
			relationName: "graph_from_node",
		}),
		toEdges: many(agentGraphEdges, {
			relationName: "graph_to_node",
		}),
	}),
);

export const agentGraphNodeToolsRelations = relations(
	agentGraphNodeTools,
	({ one }) => ({
		agentGraphNodes: one(agentGraphNodes, {
			fields: [agentGraphNodeTools.agentGraphNodeId],
			references: [agentGraphNodes.id],
		}),
		tools: one(tools, {
			fields: [agentGraphNodeTools.toolId],
			references: [tools.id],
		}),
	}),
);

export const agentGraphEdgesRelations = relations(
	agentGraphEdges,
	({ one }) => ({
		agentGraphs: one(agentGraphs, {
			fields: [agentGraphEdges.agentGraphId],
			references: [agentGraphs.id],
		}),
		fromNodeRef: one(agentGraphNodes, {
			relationName: "graph_from_node",
			fields: [agentGraphEdges.agentGraphId, agentGraphEdges.fromNode],
			references: [agentGraphNodes.agentGraphId, agentGraphNodes.nodeKey],
		}),
		toNodeRef: one(agentGraphNodes, {
			relationName: "graph_to_node",
			fields: [agentGraphEdges.agentGraphId, agentGraphEdges.toNode],
			references: [agentGraphNodes.agentGraphId, agentGraphNodes.nodeKey],
		}),
	}),
);

export const agentGraphRunsRelations = relations(
	agentGraphRuns,
	({ one, many }) => ({
		agentGraphs: one(agentGraphs, {
			fields: [agentGraphRuns.agentGraphId],
			references: [agentGraphs.id],
		}),
		agentGraphRunSteps: many(agentGraphRunSteps),
	}),
);

export const agentGraphRunStepsRelations = relations(
	agentGraphRunSteps,
	({ one }) => ({
		agentGraphRuns: one(agentGraphRuns, {
			fields: [agentGraphRunSteps.runId],
			references: [agentGraphRuns.id],
		}),
	}),
);
