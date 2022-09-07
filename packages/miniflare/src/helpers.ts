import { z } from "zod";

export type Awaitable<T> = T | Promise<T>;

// { a: A, b: B, ... } => A | B | ...
export type ValueOf<T> = T[keyof T];

// A | B | ... => A & B & ... (https://stackoverflow.com/a/50375286)
export type UnionToIntersection<U> = (
	U extends any ? (k: U) => void : never
) extends (k: infer I) => void
	? I
	: never;

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

export class MiniflareError<
	Code extends string | number = string | number,
> extends Error {
	constructor(
		readonly code: Code,
		message?: string,
		readonly cause?: Error
	) {
		super(message);
		// Restore prototype chain:
		// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
		Object.setPrototypeOf(this, new.target.prototype);
		this.name = `${new.target.name} [${code}]`;
	}
}

export type MiniflareCoreErrorCode =
	| "ERR_RUNTIME_UNSUPPORTED" // System doesn't support Cloudflare Workers runtime
	| "ERR_DISPOSED" // Attempted to use Miniflare instance after calling dispose()
	| "ERR_MODULE_PARSE" // SyntaxError when attempting to parse/locate modules
	| "ERR_MODULE_STRING_SCRIPT" // Attempt to resolve module within string script
	| "ERR_MODULE_DYNAMIC_SPEC" // Attempted to import/require a module without a literal spec
	| "ERR_MODULE_RULE"; // No matching module rule for file
export class MiniflareCoreError extends MiniflareError<MiniflareCoreErrorCode> {}

export class HttpError extends MiniflareError<number> {
	constructor(code: number, message?: string, cause?: Error) {
		super(code, message, cause);
	}
}

export type DeferredPromiseResolve<T> = (value: T | PromiseLike<T>) => void;
export type DeferredPromiseReject = (reason?: any) => void;

export class DeferredPromise<T> extends Promise<T> {
	readonly resolve: DeferredPromiseResolve<T>;
	readonly reject: DeferredPromiseReject;

	constructor() {
		let promiseResolve: DeferredPromiseResolve<T>;
		let promiseReject: DeferredPromiseReject;
		super((resolve, reject) => {
			promiseResolve = resolve;
			promiseReject = reject;
		});
		// Cannot access `this` until after `super`
		this.resolve = promiseResolve!;
		this.reject = promiseReject!;
	}
}
