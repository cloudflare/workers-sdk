import { z } from "zod";

export type Awaitable<T> = T | Promise<T>;

export function zAwaitable<T extends z.ZodTypeAny>(
	type: T
): z.ZodUnion<[T, z.ZodPromise<T>]> {
	return type.or(z.promise(type));
}

// { a: A, b: B, ... } => A | B | ...
export type ValueOf<T> = T[keyof T];

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

export function maybeApply<From, To>(
	f: (value: From) => To,
	maybeValue: From | undefined
): To | undefined {
	return maybeValue === undefined ? undefined : f(maybeValue);
}
