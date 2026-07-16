import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function createAuthProxy(target: string | undefined) {
	if (!target) {
		return undefined;
	}

	return {
		"/api/auth": {
			target,
			changeOrigin: true,
		},
		"/api/dashboard": {
			target,
			changeOrigin: true,
			configure(proxy) {
				proxy.on("proxyReq", (proxyReq) => {
					proxyReq.removeHeader("origin");
				});
			},
		},
	};
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const authProxy = createAuthProxy(env.API_URL?.trim());

	return {
		server: {
			port: 3001,
			strictPort: true,
			proxy: authProxy,
		},
		preview: {
			port: 3001,
			strictPort: true,
			proxy: authProxy,
		},
		plugins: [
			tanstackStart({
				spa: {
					enabled: true,
				},
			}),
			// react's vite plugin must come after start's vite plugin
			viteReact(),
			tailwindcss(),
		],
		resolve: {
			tsconfigPaths: true,
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
	};
});
