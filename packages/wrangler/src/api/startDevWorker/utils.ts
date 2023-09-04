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
