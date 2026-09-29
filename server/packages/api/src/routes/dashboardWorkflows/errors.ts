import type { Context } from "hono";
import { z } from "zod";
import { ServiceError } from "@/lib/service-error";
import type { HonoServerContext } from "@/types/serverContext";

// Error handler for the dashboard workflow and template routers. Expected
// failures become their JSON response; anything else stays a server error.
export function handleDashboardWorkflowError(
	error: Error,
	c: Context<HonoServerContext>,
) {
	if (error instanceof ServiceError)
		return c.json({ message: error.message }, error.status);
	if (error instanceof z.ZodError)
		return c.json(
			{ message: error.issues[0]?.message ?? "Invalid workflow definition." },
			400,
		);
	throw error;
}

// Provider errors can echo credentials or request details in their message, so
// only these fields are logged.
export function describeProviderError(error: unknown) {
	const fields = (error ?? {}) as Record<string, unknown>;
	const pick = (value: unknown) =>
		typeof value === "string" || typeof value === "number" ? value : undefined;
	return {
		name: error instanceof Error ? error.name : typeof error,
		status: pick(fields.status),
		code: pick(fields.code),
		type: pick(fields.type),
	};
}

// The draft generator reports problems with the requested draft as
// ServiceErrors. Anything else is a failure to generate one, such as the
// provider being unreachable, so the caller can retry.
export function workflowDraftErrorResponse(
	c: Context<HonoServerContext>,
	error: unknown,
) {
	if (error instanceof ServiceError)
		return c.json({ message: error.message }, error.status);
	console.error(
		"Workflow draft generation failed",
		describeProviderError(error),
	);
	return c.json(
		{ message: "Workflow draft generation failed. Please try again." },
		502,
	);
}
