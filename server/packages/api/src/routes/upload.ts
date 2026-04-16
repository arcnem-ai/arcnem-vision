import { schema } from "@arcnem-vision/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
	issuePresignedUpload,
	parsePresignRequestBody,
	readJSONBody,
	toDocumentUploadErrorResponse,
} from "@/lib/document-uploads";
import {
	requireAPIKey,
	requireAPIKeyPermission,
	requireWorkflowAPIKey,
} from "@/middleware/requireAPIKey";
import type { HonoServerContext } from "@/types/serverContext";

const { apikeys, organizations, projects } = schema;

export const uploadRouter = new Hono<HonoServerContext>({
	strict: false,
});

uploadRouter.post(
	"/uploads/presign",
	requireAPIKey,
	requireWorkflowAPIKey,
	requireAPIKeyPermission("uploads", "presign"),
	async (c) => {
		try {
			const verifiedKey = c.get("apiKey");
			if (!verifiedKey) throw new Error("Expected API key");

			const dbClient = c.get("dbClient");
			const s3Client = c.get("s3Client");
			const [uploadTarget] = await dbClient
				.select({
					organizationId: organizations.id,
					organizationSlug: organizations.slug,
					projectId: projects.id,
					projectSlug: projects.slug,
					apiKeyId: apikeys.id,
					objectKeySource: apikeys.id,
				})
				.from(apikeys)
				.innerJoin(organizations, eq(apikeys.organizationId, organizations.id))
				.innerJoin(
					projects,
					and(
						eq(apikeys.projectId, projects.id),
						eq(projects.organizationId, organizations.id),
					),
				)
				.where(eq(apikeys.id, verifiedKey.id))
				.limit(1);

			if (!uploadTarget) {
				return c.json({ message: "Invalid API key context" }, 401);
			}

			const body = await readJSONBody(c.req);
			const { contentType, visibility } = parsePresignRequestBody(body);

			return c.json(
				await issuePresignedUpload({
					dbClient,
					s3Client,
					target: uploadTarget,
					contentType,
					documentVisibility: visibility ?? "org",
				}),
			);
		} catch (error) {
			return toDocumentUploadErrorResponse(
				c,
				error,
				"Failed to create presigned upload",
			);
		}
	},
);
