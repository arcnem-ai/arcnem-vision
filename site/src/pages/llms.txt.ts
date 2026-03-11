type DocModule = {
	frontmatter?: {
		title?: string;
		description?: string;
	};
};

type DocLink = {
	title: string;
	description: string;
	slug: string;
	href: string;
};

const preferredOrder = [
	"",
	"getting-started",
	"architecture",
	"guides/embeddings",
	"guides/langchaingo",
	"guides/langgraphgo",
	"guides/genui",
	"guides/dashboard-workflow-editor",
	"reference/api",
	"reference/commands",
	"reference/contributing",
];

export const prerender = true;

const docModules = import.meta.glob<DocModule>("../content/docs/**/*.{md,mdx}", {
	eager: true,
});

function toSlug(path: string) {
	const relativePath = path
		.replace("../content/docs/", "")
		.replace(/\.(md|mdx)$/, "");

	if (relativePath === "index") {
		return "";
	}

	if (relativePath.endsWith("/index")) {
		return relativePath.slice(0, -"/index".length);
	}

	return relativePath;
}

function toHref(slug: string) {
	// Keep links relative so the file works at the domain root or a subpath.
	return slug ? `${slug}/` : "./";
}

function isJapaneseDoc(slug: string) {
	return slug === "ja" || slug.startsWith("ja/");
}

function stripLocale(slug: string) {
	if (slug === "ja") {
		return "";
	}

	return slug.replace(/^ja\//, "");
}

function compareDocs(a: DocLink, b: DocLink) {
	const aIndex = preferredOrder.indexOf(stripLocale(a.slug));
	const bIndex = preferredOrder.indexOf(stripLocale(b.slug));

	if (aIndex !== -1 || bIndex !== -1) {
		if (aIndex === -1) {
			return 1;
		}

		if (bIndex === -1) {
			return -1;
		}

		return aIndex - bIndex;
	}

	return a.slug.localeCompare(b.slug);
}

function formatSection(title: string, docs: DocLink[]) {
	if (docs.length === 0) {
		return "";
	}

	return [
		`## ${title}`,
		...docs.map((doc) => `- [${doc.title}](${doc.href}): ${doc.description}`),
	].join("\n");
}

function getDocs() {
	return Object.entries(docModules)
		.map(([path, module]) => {
			const slug = toSlug(path);
			const title = module.frontmatter?.title?.trim();

			if (!title) {
				return null;
			}

			return {
				title,
				description: module.frontmatter?.description?.trim() ?? "",
				slug,
				href: toHref(slug),
			};
		})
		.filter((doc): doc is DocLink => doc !== null)
		.sort(compareDocs);
}

export function GET() {
	const docs = getDocs();
	const englishDocs = docs.filter((doc) => !isJapaneseDoc(doc.slug));
	const japaneseDocs = docs.filter((doc) => isJapaneseDoc(doc.slug));

	const startHere = englishDocs.filter(
		(doc) =>
			doc.slug === "" || doc.slug === "getting-started" || doc.slug === "architecture",
	);
	const guides = englishDocs.filter((doc) => doc.slug.startsWith("guides/"));
	const reference = englishDocs.filter((doc) => doc.slug.startsWith("reference/"));

	const body = [
		"# Arcnem Vision",
		"",
		"> Documentation for Arcnem Vision, a vision-native AI stack with a Flutter client, Bun API, React dashboard, Go agent services, and MCP tools.",
		"",
		"Use the English docs for the primary product and implementation context. The optional section links to the Japanese mirror of the same documentation.",
		"",
		formatSection("Start Here", startHere),
		"",
		formatSection("Guides", guides),
		"",
		formatSection("Reference", reference),
		"",
		formatSection("Optional", japaneseDocs),
		"",
	]
		.filter(Boolean)
		.join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
