import { onTestFinished } from "vitest";

export function useTeardown(): typeof teardown {
	const teardownCallbacks: (() => void | Promise<void>)[] = [];
	let cleanupRegistered = false;

	function teardown(callback: () => void | Promise<void>) {
		// `unshift()` so teardown callbacks executed in reverse
		teardownCallbacks.unshift(callback);

		if (!cleanupRegistered) {
			cleanupRegistered = true;
			onTestFinished(async () => {
				const errors: unknown[] = [];
				for (const teardownCallback of teardownCallbacks.splice(0)) {
					try {
						await teardownCallback();
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
		}
	}

	return teardown;
}
