import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
	integrations: [
		starlight({
			title: "Arcnem Vision",
			logo: {
				src: "./src/assets/logo.svg",
			},
			social: [
				{
					icon: "external",
					label: "Arcnem",
					href: "https://arcnem.ai",
				},
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/arcnem-ai/arcnem-vision",
				},
			],
			defaultLocale: "root",
			locales: {
				root: {
					label: "English",
					lang: "en",
				},
				ja: {
					label: "日本語",
					lang: "ja",
				},
			},
			sidebar: [
				{
					label: "Start Here",
					translations: { ja: "はじめに" },
					items: [
						{
							label: "Welcome",
							translations: { ja: "ようこそ" },
							link: "/",
						},
						{
							label: "Getting Started",
							translations: { ja: "クイックスタート" },
							slug: "getting-started",
						},
						{
							label: "Architecture",
							translations: { ja: "アーキテクチャ" },
							slug: "architecture",
						},
					],
				},
				{
					label: "Guides",
					translations: { ja: "ガイド" },
					items: [
						{
							label: "Embeddings & pgvector",
							slug: "guides/embeddings",
						},
						{
							label: "LangChain Go",
							slug: "guides/langchaingo",
						},
						{
							label: "LangGraph Go",
							slug: "guides/langgraphgo",
						},
						{
							label: "Flutter GenUI",
							slug: "guides/genui",
						},
						{
							label: "Dashboard Workflow Editor",
							translations: { ja: "ダッシュボード ワークフローエディタ" },
							slug: "guides/dashboard-workflow-editor",
						},
					],
				},
				{
					label: "Reference",
					translations: { ja: "リファレンス" },
					items: [
						{
							label: "API Examples",
							translations: { ja: "APIの例" },
							slug: "reference/api",
						},
						{
							label: "Commands",
							translations: { ja: "コマンド一覧" },
							slug: "reference/commands",
						},
						{
							label: "Contributing",
							translations: { ja: "コントリビューション" },
							slug: "reference/contributing",
						},
					],
				},
			],
			customCss: ["./src/styles/custom.css"],
		}),
	],
});
