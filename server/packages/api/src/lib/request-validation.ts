import type { Context } from "hono";
import type { HonoServerContext } from "@/types/serverContext";

type SafeParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: { issues: Array<{ message: string }> } };

type Schema<T> = {
	safeParse: (value: unknown) => SafeParseResult<T>;
};

export async function readValidatedBody<T>(
	c: Context<HonoServerContext>,
	schema: Schema<T>,
) {
	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return {
			ok: false as const,
			response: c.json({ message: "Invalid JSON request body" }, 400),
		};
	}

	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		return {
			ok: false as const,
			response: c.json(
				{ message: parsed.error.issues[0]?.message ?? "Invalid request body" },
				400,
			),
		};
	}

	return {
		ok: true as const,
		data: parsed.data,
	};
}

export function readValidatedInput<T>(schema: Schema<T>, payload: unknown) {
	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		return {
			ok: false as const,
			message: parsed.error.issues[0]?.message ?? "Invalid request",
		};
	}

	return {
		ok: true as const,
		data: parsed.data,
	};
}
