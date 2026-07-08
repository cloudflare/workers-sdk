export type MaybePromise<T> = T | Promise<T>;

export type DeferredPromise<T> = {
	promise: Promise<T>;
	resolve: (_: MaybePromise<T>) => void;
	reject: (_: Error) => void;
};

export function createDeferred<T>(
	previousDeferred?: DeferredPromise<T>
): DeferredPromise<T> {
	const { promise, resolve, reject } = Promise.withResolvers<T>();

	// if passed a previousDeferred, ensure it is resolved with the newDeferred
	// so that await-ers of previousDeferred are now await-ing newDeferred
	previousDeferred?.resolve(promise);

	return { promise, resolve, reject };
}
