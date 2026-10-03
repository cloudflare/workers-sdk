import { AsyncLocalStorage } from "node:async_hooks";

/**
 * In production, Workers have a 30-second limit for `waitUntil` promises.
 * We use the same limit here. If promises are still pending after this,
 * they almost certainly indicate a bug (e.g. a `waitUntil` promise that
 * will never resolve). We log a warning and move on so the test suite
 * doesn't hang indefinitely.
 */
let WAIT_UNTIL_TIMEOUT = 30_000;

/** @internal — only exposed for tests */
export function setWaitUntilTimeout(ms: number): void {
	WAIT_UNTIL_TIMEOUT = ms;
}

const kTimedOut = Symbol("kTimedOut");
const kCancelled = Symbol("kCancelled");
// A last test may leave fake timers active. Runtime shutdown still needs a real
// deadline, captured before test code can replace these globals.
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

/**
 * Empty array and wait for all promises to resolve until no more added.
 * If a single promise rejects, the rejection will be passed-through.
 * If multiple promises reject, the rejections will be aggregated.
 *
 * If any batch of promises hasn't settled after {@link WAIT_UNTIL_TIMEOUT}ms,
 * a warning is logged and the remaining promises are abandoned.
 */
export async function waitForWaitUntil(
	/* mut */ waitUntil: unknown[]
): Promise<void> {
	const errors: unknown[] = [];

	while (waitUntil.length > 0) {
		const batch = waitUntil.splice(0);
		// Explicit context drains discharge only the registrations they actually
		// joined. Later registrations, even of the same Promise, remain owned.
		const promises = new Set(batch);
		const registrations = [...globalWaitUntil].filter(({ promise }) =>
			promises.has(promise)
		);
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const result = await Promise.race([
			Promise.allSettled(batch).then((results) => ({ results })),
			new Promise<typeof kTimedOut>(
				(resolve) =>
					(timeoutId = setTimeout(() => resolve(kTimedOut), WAIT_UNTIL_TIMEOUT))
			),
		]);
		clearTimeout(timeoutId);

		if (result === kTimedOut) {
			__console.warn(
				`[vitest-plugin] ${batch.length} waitUntil promise(s) did not ` +
					`resolve within ${WAIT_UNTIL_TIMEOUT / 1000}s and will be abandoned. ` +
					`This normally means your Worker's waitUntil handler has a bug ` +
					`that prevents it from settling (e.g. a fetch that never completes ` +
					`or a missing resolve/reject call).`
			);
			// Stop draining — any promises added during this batch are also abandoned
			waitUntil.length = 0;
			break;
		}

		for (const registration of registrations) {
			globalWaitUntil.delete(registration);
		}

		// Record all rejected promises
		for (const settled of result.results) {
			if (settled.status === "rejected") {
				errors.push(settled.reason);
			}
		}
	}

	if (errors.length === 1) {
		// If there was only one rejection, rethrow it
		throw errors[0];
	} else if (errors.length > 1) {
		// If there were more rejections, rethrow them all
		throw new AggregateError(errors);
	}
}

// Registered Worker work may still need the module loader after the test body
// finishes. Keep it owned until it settles or the runtime is disposed.
const globalWaitUntil = new Set<{ promise: unknown }>();
export function registerGlobalWaitUntil(promise: unknown) {
	globalWaitUntil.add({ promise });
}

/**
 * Finish registered work before the runner closes its module-loader RPC.
 * A single deadline covers the entire drain, including newly registered work.
 * Preserve earlier run failures alongside background failures or a timeout.
 */
export async function waitForGlobalWaitUntil(
	/* mut */ errors: unknown[] = [],
	signal?: AbortSignal
): Promise<void> {
	if (globalWaitUntil.size > 0) {
		const timeout = WAIT_UNTIL_TIMEOUT;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let cancel: () => void = () => {};
		const stopped = Promise.race([
			new Promise<typeof kTimedOut>((resolve) => {
				timeoutId = originalSetTimeout.call(
					globalThis,
					() => resolve(kTimedOut),
					timeout
				);
			}),
			new Promise<typeof kCancelled>((resolve) => {
				cancel = () => resolve(kCancelled);
				if (signal?.aborted) {
					cancel();
				} else {
					signal?.addEventListener("abort", cancel, { once: true });
				}
			}),
		]);
		try {
			while (globalWaitUntil.size > 0) {
				const batch = [...globalWaitUntil];
				const result = await Promise.race([
					Promise.all(
						batch.map(async (registration) => {
							try {
								await registration.promise;
							} catch (error) {
								// Record each rejection as it settles: another promise in
								// this same batch may never settle before the deadline.
								if (globalWaitUntil.has(registration)) {
									errors.push(error);
								}
							} finally {
								globalWaitUntil.delete(registration);
							}
						})
					),
					stopped,
				]);
				if (result === kTimedOut) {
					errors.push(
						new Error(
							`[vitest-plugin] ${globalWaitUntil.size} registered waitUntil promise(s) ` +
								`did not resolve within ${timeout / 1000}s before test shutdown.`
						)
					);
					break;
				}
				if (result === kCancelled) {
					errors.push(signal?.reason);
					break;
				}
			}
		} finally {
			originalClearTimeout.call(globalThis, timeoutId);
			signal?.removeEventListener("abort", cancel);
		}
	}

	if (errors.length === 1 && errors[0] instanceof Error) {
		throw errors[0];
	} else if (errors.length > 0) {
		// Vitest treats a falsy serialized run error as success. An error envelope
		// retains every thrown value without losing undefined, null, false or 0.
		throw new AggregateError(
			errors,
			"Errors occurred while finishing registered Worker work."
		);
	}
}

export const handlerContextStore = new AsyncLocalStorage<ExecutionContext>();
export function registerHandlerAndGlobalWaitUntil(promise: Promise<unknown>) {
	const handlerContext = handlerContextStore.getStore();
	if (handlerContext === undefined) {
		registerGlobalWaitUntil(promise);
	} else {
		// `patchAndRunWithHandlerContext()` ensures handler `waitUntil()` calls
		// `registerGlobalWaitUntil()` too
		handlerContext.waitUntil(promise);
	}
}
