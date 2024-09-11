import { afterEach } from "vitest";

export function useTeardown(): typeof teardown {
	const teardownCallbacks: (() => void | Promise<void>)[] = [];
	// TODO: Switch to vitest.onTestFinished()
	// We can't really use `onTestFinished()` because it always runs the callback after all the `afterEach()` blocks have run.
	// And so, for example, all the spies have been removed by the time it is called.
	// This leads to unwanted console logs in tests for example.
	function teardown(callback: () => void | Promise<void>) {
		// `unshift()` so teardown callbacks executed in reverse
		teardownCallbacks.unshift(callback);
	}

	afterEach(async () => {
		const errors: unknown[] = [];
		for (const callback of teardownCallbacks.splice(0)) {
			try {
				await callback();
			} catch (error) {
				errors.push(error);
			}
		}
		if (errors.length > 0) {
			throw new AggregateError(
				errors,
				["Unable to teardown:", ...errors.map(String)].join("\n")
			);
		}
	});
	return teardown;
}
