import { z } from "zod";

export type JSONValue =
	| null
	| string
	| number
	| boolean
	| JSONValue[]
	| { [key: string]: JSONValue };

export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
	z.union([
		z.null(),
		z.string(),
		z.number(),
		z.boolean(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);
