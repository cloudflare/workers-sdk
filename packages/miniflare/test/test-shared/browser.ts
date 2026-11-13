import type { TestOptions } from "vitest";

/** Retry transient Chrome startup failures on loaded CI runners. */
export const BROWSER_RENDERING_RETRY = {
	retry: {
		condition:
			/Chrome readiness probe .* timed out|Test timed out|Failed to launch (the browser process|local browser)/i,
		count: 3,
		delay: 1_000,
	},
} satisfies TestOptions;

/** Allow the first browser warm-up to download Chrome on a cold runner. */
export const CHROME_INSTALL_TIMEOUT = 10 * 60 * 1_000;

/**
 * Warm Chrome before timed tests, retrying only recognized startup failures.
 *
 * A generous hook timeout accommodates downloads, but does not extend Chrome's
 * readiness deadline. Check unsuccessful responses inside `warmup` and include
 * their bodies in the error so the retry condition can recognize launch failures.
 *
 * @param warmup - Launch Chrome and check that it is ready for the tests.
 */
export async function retryBrowserStartup(
	warmup: () => Promise<void>
): Promise<void> {
	const { condition, count, delay } = BROWSER_RENDERING_RETRY.retry;
	for (let attempt = 0; ; attempt++) {
		try {
			return await warmup();
		} catch (e) {
			if (attempt >= count || !condition.test(String(e))) {
				throw e;
			}
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}
