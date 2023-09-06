export type MaybePromise<T> = T | Promise<T>;
export type DeferredPromise<T> = Promise<T> & {
	resolve: (_: MaybePromise<T>) => void;
	reject: (_: Error) => void;
};

export function createDeferredPromise<T>(): DeferredPromise<T> {
	let resolve, reject;
	const deferred = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	return Object.assign(deferred, {
		resolve,
		reject,
	} as unknown) as DeferredPromise<T>;
}

export class NotImplementedError extends Error {
	constructor(func: string, namespace?: string) {
		if (namespace) func = `${namespace}#${func}`;
		super(`Not Implemented Error: ${func}`);
	}
}

export function throwNotImplementedError(func: string, namespace?: string) {
	// throw new NotImplementedError(func, namespace);
	if (namespace) func = `${namespace}#${func}`;
	console.warn(`Not Implemented Error: ${func}`);
}
