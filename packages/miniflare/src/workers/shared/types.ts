export type Awaitable<T> = T | Promise<T>;

// { a: A, b: B, ... } => A | B | ...
export type ValueOf<T> = T[keyof T];

export function maybeApply<From, To>(
	f: (value: From) => To,
	maybeValue: From | undefined
): To | undefined {
	return maybeValue === undefined ? undefined : f(maybeValue);
}
