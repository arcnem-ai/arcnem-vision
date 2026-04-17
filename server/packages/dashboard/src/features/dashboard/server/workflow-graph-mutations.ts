import {
	createWorkflowFromTemplateInputSchema,
	createWorkflowInputSchema,
	createWorkflowTemplateFromWorkflowInputSchema,
	generatedWorkflowDraftResponseSchema,
	generateWorkflowDraftInputSchema,
	idResponseSchema,
	updateWorkflowInputSchema,
	updateWorkflowTemplateInputSchema,
	workflowFromTemplateResponseSchema,
	workflowTemplateCreatedResponseSchema,
	workflowTemplateUpdatedResponseSchema,
} from "@arcnem-vision/shared";
import { createServerFn } from "@tanstack/react-start";
import { fetchDashboardAPI } from "@/lib/api-server";

export const createWorkflow = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => createWorkflowInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/workflows",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to create workflow.",
			},
			idResponseSchema,
		),
	);

export const generateWorkflowDraft = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		generateWorkflowDraftInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/workflows/generate-draft",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to generate workflow draft.",
			},
			generatedWorkflowDraftResponseSchema,
		),
	);

export const updateWorkflow = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) => updateWorkflowInputSchema.parse(input))
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/workflows/update",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update workflow.",
			},
			idResponseSchema,
		),
	);

export const createWorkflowFromTemplate = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		createWorkflowFromTemplateInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/workflows/from-template",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to create workflow from template.",
			},
			workflowFromTemplateResponseSchema,
		),
	);

export const createWorkflowTemplateFromWorkflow = createServerFn({
	method: "POST",
})
	.inputValidator((input: unknown) =>
		createWorkflowTemplateFromWorkflowInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/workflow-templates/from-workflow",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to create workflow template.",
			},
			workflowTemplateCreatedResponseSchema,
		),
	);

export const updateWorkflowTemplate = createServerFn({ method: "POST" })
	.inputValidator((input: unknown) =>
		updateWorkflowTemplateInputSchema.parse(input),
	)
	.handler(async ({ data }) =>
		fetchDashboardAPI(
			"/dashboard/workflow-templates/update",
			{
				method: "POST",
				body: data,
				fallbackErrorMessage: "Failed to update workflow template.",
			},
			workflowTemplateUpdatedResponseSchema,
		),
	);
