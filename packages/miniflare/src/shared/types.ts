import assert from "assert";
import path from "path";
import { ParseParams, z } from "zod";

export function zAwaitable<T extends z.ZodTypeAny>(
	type: T
): z.ZodUnion<[T, z.ZodPromise<T>]> {
	return type.or(z.promise(type));
}

export type OptionalZodTypeOf<T extends z.ZodTypeAny | undefined> =
	T extends z.ZodTypeAny ? z.TypeOf<T> : undefined;

// https://github.com/colinhacks/zod/blob/59768246aa57133184b2cf3f7c2a1ba5c3ab08c3/README.md?plain=1#L1302-L1317
export const LiteralSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);
export type Literal = z.infer<typeof LiteralSchema>;
export type Json = Literal | { [key: string]: Json } | Json[];
export const JsonSchema: z.ZodType<Json> = z.lazy(() =>
	z.union([LiteralSchema, z.array(JsonSchema), z.record(JsonSchema)])
);

let rootPath: string | undefined;
export function parseWithRootPath<Z extends z.ZodTypeAny>(
	newRootPath: string,
	schema: Z,
	data: unknown,
	params?: Partial<ParseParams>
): z.infer<Z> {
	rootPath = newRootPath;
	try {
		return schema.parse(data, params);
	} finally {
		rootPath = undefined;
	}
}
export const PathSchema = z.string().transform((p) => {
	assert(
		rootPath !== undefined,
		"Expected `PathSchema` to be parsed within `parseWithRootPath()`"
	);
	return path.resolve(rootPath, p);
});

/** @internal */
export function _isCyclic(value: unknown, seen = new Set<unknown>()) {
	if (typeof value !== "object" || value === null) return false;
	for (const child of Object.values(value)) {
		if (seen.has(child)) return true;
		seen.add(child);
		if (_isCyclic(child, seen)) return true;
		seen.delete(child);
	}
	return false;
}
