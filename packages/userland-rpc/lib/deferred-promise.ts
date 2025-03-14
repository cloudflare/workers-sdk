export type DeferredPromiseResolve<T> = (value: T | PromiseLike<T>) => void;
export type DeferredPromiseReject = (reason?: any) => void;

export class DeferredPromise<T> extends Promise<T> {
	readonly resolve: DeferredPromiseResolve<T>;
	readonly reject: DeferredPromiseReject;

	constructor(
		executor: (
			resolve: (value: T | PromiseLike<T>) => void,
			reject: (reason?: any) => void
		) => void = () => {}
	) {
		let promiseResolve: DeferredPromiseResolve<T>;
		let promiseReject: DeferredPromiseReject;
		super((resolve, reject) => {
			promiseResolve = resolve;
			promiseReject = reject;
			return executor(resolve, reject);
		});
		// Cannot access `this` until after `super`
		// Safety of `!`: callback passed to `super()` is executed immediately
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.resolve = promiseResolve!;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.reject = promiseReject!;
	}
}
