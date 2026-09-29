import { schema } from "@arcnem-vision/db";
import { ensureCatalog } from "@arcnem-vision/db/catalog";
import type { PGDB } from "@arcnem-vision/db/server";
import { createUniqueSlug, type WorkflowDraft } from "@arcnem-vision/shared";
import { eq, sql } from "drizzle-orm";
import { createWorkflow } from "@/lib/workflow-operations";

// Prepares a fresh deployment: the model and tool catalog, the first owner with
// an organization and project, and one starter workflow. Every step skips what
// already exists, so it is safe to run on each deploy.

export type BootstrapInput = {
	ownerEmail: string;
	organizationName: string;
};

export type BootstrapResult = {
	ownerCreated: boolean;
	organizationCreated: boolean;
	organizationId: string;
	starterWorkflowId: string | null;
};

function starterWorkflow(
	catalog: Awaited<ReturnType<typeof ensureCatalog>>,
): WorkflowDraft {
	const describeModel = catalog.models.gpt41Mini;
	return {
		name: "Describe and index images",
		description:
			"Describes each uploaded image, saves the description, and embeds the image and its description so similar documents can be found.",
		entryNode: "describe",
		nodes: [
			{
				nodeKey: "describe",
				nodeType: "worker",
				x: 80,
				y: 80,
				inputKey: "temp_url",
				outputKey: "description",
				modelId: describeModel,
				toolIds: [],
				config: {
					input_mode: "image_url",
					input_prompt:
						"Describe this image in one concise paragraph (max 50 words). Mention the main subject, any visible text, and the layout.",
					max_iterations: 3,
					system_message:
						"You describe images for search. Return one concise plain-text paragraph of at most 50 words.",
				},
			},
			{
				nodeKey: "save_description",
				nodeType: "tool",
				x: 300,
				y: 80,
				toolIds: [catalog.tools.createDocDesc],
				config: {
					input_mapping: {
						text: "description",
						model_name: "_const:gpt-4.1-mini",
						model_version: "_const:",
						model_provider: "_const:OPENAI",
					},
					output_mapping: { description_id: "document_description_id" },
				},
			},
			{
				nodeKey: "embed_document",
				nodeType: "tool",
				x: 520,
				y: 80,
				toolIds: [catalog.tools.createDocEmb],
				config: {},
			},
			{
				nodeKey: "embed_description",
				nodeType: "tool",
				x: 740,
				y: 80,
				toolIds: [catalog.tools.createDescEmb],
				config: {
					input_mapping: {
						text: "description",
						document_description_id: "document_description_id",
					},
				},
			},
		],
		edges: [
			{ fromNode: "describe", toNode: "save_description" },
			{ fromNode: "save_description", toNode: "embed_document" },
			{ fromNode: "embed_document", toNode: "embed_description" },
			{ fromNode: "embed_description", toNode: "END" },
		],
	};
}

// Finds or creates the owner, then gives them an organization with a default
// project unless they already belong to one.
async function ensureOwner(db: PGDB, input: BootstrapInput) {
	const email = input.ownerEmail.trim().toLowerCase();
	return db.transaction(async (tx) => {
		let ownerCreated = false;
		let user = await tx.query.users.findFirst({
			where: (row, { eq }) => eq(row.email, email),
			columns: { id: true },
		});
		if (!user) {
			[user] = await tx
				.insert(schema.users)
				.values({
					name: email.split("@")[0] ?? email,
					email,
					emailVerified: true,
				})
				.returning({ id: schema.users.id });
			if (!user) throw new Error("Failed to create the owner");
			ownerCreated = true;
		}

		const userId = user.id;
		const membership = await tx.query.members.findFirst({
			where: (row, { eq }) => eq(row.userId, userId),
			columns: { organizationId: true },
		});
		if (membership) {
			return {
				userId,
				organizationId: membership.organizationId,
				ownerCreated,
				organizationCreated: false,
			};
		}

		const organizationSlugs = await tx
			.select({ slug: schema.organizations.slug })
			.from(schema.organizations);
		const [organization] = await tx
			.insert(schema.organizations)
			.values({
				name: input.organizationName,
				slug: createUniqueSlug(
					input.organizationName,
					organizationSlugs.map((row) => row.slug),
				),
			})
			.returning({ id: schema.organizations.id });
		if (!organization) throw new Error("Failed to create the organization");

		await tx.insert(schema.members).values({
			userId,
			organizationId: organization.id,
			role: "owner",
		});
		await tx.insert(schema.projects).values({
			name: "Default Project",
			slug: "default-project",
			organizationId: organization.id,
		});
		return {
			userId,
			organizationId: organization.id,
			ownerCreated,
			organizationCreated: true,
		};
	});
}

export async function bootstrapInstallation(
	db: PGDB,
	input: BootstrapInput,
): Promise<BootstrapResult> {
	// Overlapping deploys may run this at the same time. The lock makes the
	// second run wait and then find everything the first one created. The
	// transaction supports every query the steps run, including their own
	// transactions, which become savepoints.
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended('arcnem-vision:bootstrap', 0))`,
		);
		return bootstrapSerialized(tx as unknown as PGDB, input);
	});
}

async function bootstrapSerialized(
	db: PGDB,
	input: BootstrapInput,
): Promise<BootstrapResult> {
	const catalog = await ensureCatalog(db);
	const owner = await ensureOwner(db, input);
	const result = {
		ownerCreated: owner.ownerCreated,
		organizationCreated: owner.organizationCreated,
		organizationId: owner.organizationId,
	};

	// Only an organization that has never had a workflow gets the starter, so
	// archiving or renaming it is never undone by a later deploy.
	const [anyWorkflow] = await db
		.select({ id: schema.agentGraphs.id })
		.from(schema.agentGraphs)
		.where(eq(schema.agentGraphs.organizationId, owner.organizationId))
		.limit(1);
	if (anyWorkflow) return { ...result, starterWorkflowId: null };

	const workflow = await createWorkflow(
		db,
		{ userId: owner.userId, organizationId: owner.organizationId },
		starterWorkflow(catalog),
	);
	return { ...result, starterWorkflowId: workflow.id };
}
