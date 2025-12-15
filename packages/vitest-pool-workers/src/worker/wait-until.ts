import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Empty array and wait for all promises to resolve until no more added.
 * If a single promise rejects, the rejection will be passed-through.
 * If multiple promises reject, the rejections will be aggregated.
 */
export async function waitForWaitUntil(
	/* mut */ waitUntil: unknown[]
): Promise<void> {
	const errors: unknown[] = [];

	while (waitUntil.length > 0) {
		const results = await Promise.allSettled(waitUntil.splice(0));
		// Record all rejected promises
		for (const result of results) {
			if (result.status === "rejected") {
				errors.push(result.reason);
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
