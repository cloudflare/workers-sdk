export type Awaitable<T> = T | Promise<T>;

// { a: A, b: B, ... } => A | B | ...
export type ValueOf<T> = T[keyof T];

export interface JsonError {
	message?: string;
	name?: string;
	stack?: string;
	cause?: JsonError;
}

export function reduceError(e: any): JsonError {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === undefined ? undefined : reduceError(e.cause),
	};
}

export function maybeApply<From, To>(
	f: (value: From) => To,
	maybeValue: From | undefined
): To | undefined {
	return maybeValue === undefined ? undefined : f(maybeValue);
}
