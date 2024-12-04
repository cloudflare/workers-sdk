import { sleep } from "./sleep";

type RetryConfig = {
	times: number;
	sleepMs?: number;
	exitCondition?: (e: unknown) => boolean;
};

/**
 * Retries the provided function a number of `times`, catching any errors that may arise.
 *
 * It's highly recommended to `retry` any command that involves a network request to improve the
 * user experience and reduce flakiness in e2e tests.
 *
 * @param config.times - The number of times to retry the function
 * @param config.sleepMs - How many ms to sleep between retries
 * @param config.exitCondition - The retry loop will be prematurely exited if this function returns true
 * @param fn - The function to retry
 *
 * @example
 * ```
 * await retry({ times: 3 }, async () => {
 *   await someApiCall(id);
 * });
 * ```
 *
 */
export const retry = async <T>(config: RetryConfig, fn: () => Promise<T>) => {
	let { times } = config;
	let error: unknown = null;
	while (times > 0) {
		try {
			return await fn();
		} catch (e) {
			error = e;
			times--;
			if (config.exitCondition?.(e)) {
				break;
			}
			await sleep(config.sleepMs ?? 1000);
		}
	}
	throw error;
};
