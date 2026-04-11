import { documentChatRequestSchema } from "@arcnem-vision/shared";
import { Hono } from "hono";
import { requireDashboardOrganizationContext } from "@/lib/dashboard-auth";
import { toAgentMessages } from "@/lib/document-chat/helpers";
import { resolveRequestedChatScope } from "@/lib/document-chat/scope";
import { createDocumentChatResponse } from "@/lib/document-chat/stream";
import { readValidatedBody } from "@/lib/request-validation";
import type { HonoServerContext } from "@/types/serverContext";

export const dashboardChatRouter = new Hono<HonoServerContext>({
	strict: false,
});

dashboardChatRouter.post("/dashboard/documents/chat", async (c) => {
	const access = await requireDashboardOrganizationContext(c);
	if (!access.ok) {
		return access.response;
	}

	const parsed = await readValidatedBody(c, documentChatRequestSchema);
	if (!parsed.ok) {
		return parsed.response;
	}

	try {
		const scope = await resolveRequestedChatScope(
			c.get("dbClient"),
			access.context.organizationId,
			parsed.data.data?.scope ?? parsed.data.scope,
		);

		return createDocumentChatResponse({
			messages: toAgentMessages(parsed.data.messages),
			conversationId:
				parsed.data.data?.conversationId ??
				parsed.data.conversationId ??
				crypto.randomUUID(),
			organizationId: access.context.organizationId,
			userId: access.context.session.userId,
			scope,
		});
	} catch (error) {
		return c.json(
			{
				message:
					error instanceof Error ? error.message : "Document chat failed",
			},
			400,
		);
	}
});
