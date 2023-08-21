export type MaybePromise<T> = T | Promise<T>;
export type DeferredPromise<T> = Promise<T> & {
	resolve: (_: MaybePromise<T>) => void;
	reject: (_: Error) => void;
};

export function createDeferredPromise<T>(
	previousDeferred?: DeferredPromise<T>
): DeferredPromise<T> {
	let resolve, reject;
	const newDeferred = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});

	// if passed a previousDeferred, ensure it is resolved with the newDeferred
	// so that await-ers of previousDeferred are now await-ing newDeferred
	previousDeferred?.resolve(newDeferred);

	return Object.assign(newDeferred, {
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
	console.warn(`Not Implemented Error: ${func}`); // TODO: change this to logger.debug(...) but it causes the e2e tests to crash???
}

export function assertNever(_value: never) {}
