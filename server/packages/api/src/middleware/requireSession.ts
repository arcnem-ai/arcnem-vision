import { createMiddleware } from "hono/factory";
import { isAPIDebugModeEnabled } from "@/env/localOnlySettings";
import type { HonoServerContext } from "@/types/serverContext";

const isDebugMode = isAPIDebugModeEnabled();

export const requireSession = createMiddleware<HonoServerContext>(
	async (c, next) => {
		if (isDebugMode) {
			await next();
			return;
		}

		if (!c.get("user") || !c.get("session")) {
			return c.json({ message: "Unauthorized" }, 401);
		}

		await next();
	},
);
