export interface Deferred<T> extends Promise<T> {
	readonly state: 'pending' | 'fulfilled' | 'rejected';
	resolve(value?: T | PromiseLike<T>): void;
	// deno-lint-ignore no-explicit-any
	reject(reason?: any): void;
}

export function deferred<T>(): Deferred<T>;
