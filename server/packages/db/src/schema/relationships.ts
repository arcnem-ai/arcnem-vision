import { relations } from "drizzle-orm";
import {
	agentGraphEdges,
	agentGraphNodes,
	agentGraphNodeTools,
	agentGraphRunSteps,
	agentGraphRuns,
	agentGraphs,
	agentGraphTemplates,
	agentGraphTemplateVersions,
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
	documentOCRResults,
	documentSegmentations,
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
	presignedUploads: many(presignedUploads),
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
	presignedUploads: many(presignedUploads),
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
	documentOCRResults: many(documentOCRResults),
	sourceDocumentSegmentations: many(documentSegmentations, {
		relationName: "source_document_segmentations",
	}),
	segmentedDocumentSegmentations: many(documentSegmentations, {
		relationName: "segmented_document_segmentations",
	}),
}));

export const presignedUploadsRelations = relations(
	presignedUploads,
	({ one }) => ({
		organizations: one(organizations, {
			fields: [presignedUploads.organizationId],
			references: [organizations.id],
		}),
		projects: one(projects, {
			fields: [presignedUploads.projectId],
			references: [projects.id],
		}),
		devices: one(devices, {
			fields: [presignedUploads.deviceId],
			references: [devices.id],
		}),
	}),
);

export const modelsRelations = relations(models, ({ many }) => ({
	documentEmbeddings: many(documentEmbeddings),
	documentDescriptions: many(documentDescriptions),
	documentOCRResults: many(documentOCRResults),
	documentSegmentations: many(documentSegmentations),
	documentDescriptionEmbeddings: many(documentDescriptionEmbeddings),
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

export const documentSegmentationsRelations = relations(
	documentSegmentations,
	({ one }) => ({
		sourceDocuments: one(documents, {
			relationName: "source_document_segmentations",
			fields: [documentSegmentations.sourceDocumentId],
			references: [documents.id],
		}),
		segmentedDocuments: one(documents, {
			relationName: "segmented_document_segmentations",
			fields: [documentSegmentations.segmentedDocumentId],
			references: [documents.id],
		}),
		models: one(models, {
			fields: [documentSegmentations.modelId],
			references: [models.id],
		}),
	}),
);

export const documentOCRResultsRelations = relations(
	documentOCRResults,
	({ one }) => ({
		documents: one(documents, {
			fields: [documentOCRResults.documentId],
			references: [documents.id],
		}),
		models: one(models, {
			fields: [documentOCRResults.modelId],
			references: [models.id],
		}),
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
	agentGraphNodeTools: many(agentGraphNodeTools),
}));

export const agentGraphTemplatesRelations = relations(
	agentGraphTemplates,
	({ one, many }) => ({
		organizations: one(organizations, {
			fields: [agentGraphTemplates.organizationId],
			references: [organizations.id],
		}),
		currentVersion: one(agentGraphTemplateVersions, {
			fields: [agentGraphTemplates.currentVersionId],
			references: [agentGraphTemplateVersions.id],
			relationName: "template_current_version",
		}),
		agentGraphTemplateVersions: many(agentGraphTemplateVersions, {
			relationName: "template_versions",
		}),
		agentGraphs: many(agentGraphs),
	}),
);

export const agentGraphTemplateVersionsRelations = relations(
	agentGraphTemplateVersions,
	({ one, many }) => ({
		agentGraphTemplates: one(agentGraphTemplates, {
			fields: [agentGraphTemplateVersions.agentGraphTemplateId],
			references: [agentGraphTemplates.id],
			relationName: "template_versions",
		}),
		currentForTemplate: many(agentGraphTemplates, {
			relationName: "template_current_version",
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
	agentGraphTemplateVersions: one(agentGraphTemplateVersions, {
		fields: [agentGraphs.agentGraphTemplateVersionId],
		references: [agentGraphTemplateVersions.id],
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
		projects: one(projects, {
			fields: [agentGraphRuns.projectId],
			references: [projects.id],
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
