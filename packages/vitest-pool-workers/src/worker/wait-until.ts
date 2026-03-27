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
				`[vitest-pool-workers] ${batch.length} waitUntil promise(s) did not ` +
					`resolve within ${WAIT_UNTIL_TIMEOUT / 1000}s and will be abandoned. ` +
					`This normally means your Worker's waitUntil handler has a bug ` +
					`that prevents it from settling (e.g. a fetch that never completes ` +
					`or a missing resolve/reject call).`
			);
			// Stop draining — any promises added during this batch are also abandoned
			waitUntil.length = 0;
			break;
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

// If isolated storage is enabled, we ensure all `waitUntil()`s are `await`ed at
// the end of each test, as these may contain storage calls (e.g. caching
// responses). Note we can't wait at the end of `.concurrent` tests, as we can't
// track which `waitUntil()`s belong to which tests.
//
// If isolated storage is disabled, we ensure all `waitUntil()`s are `await`ed
// at the end of each test *file*. This ensures we don't try to dispose the
// runtime until all `waitUntil()`s complete.
const globalWaitUntil: unknown[] = [];
export function registerGlobalWaitUntil(promise: unknown) {
	globalWaitUntil.push(promise);
}
export function waitForGlobalWaitUntil(): Promise<void> {
	return waitForWaitUntil(globalWaitUntil);
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
