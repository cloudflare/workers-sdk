import { setTimeout } from "node:timers/promises";
import { APIError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { logger } from "../logger";

const MAX_ATTEMPTS = 3;
/**
 * Wrap around calls to the Cloudflare API to automatically retry
 * calls that result in a 5xx error code, indicating an API failure.
 *
 * Retries will back off at a rate of 1000ms per retry, with a 0ms delay for the first retry
 *
 * Note: this will not retry 4xx or other failures, as those are
 * likely legitimate user error.
 */
export async function retryOnAPIFailure<T>(
	action: () => T | Promise<T>,
	backoff = 0,
	attempts = MAX_ATTEMPTS,
	abortSignal?: AbortSignal
): Promise<T> {
	try {
		return await action();
	} catch (err) {
		if (err instanceof APIError) {
			if (!err.isRetryable()) {
				throw err;
			}
		} else if (err instanceof DOMException && err.name === "TimeoutError") {
			// Per-request timeouts (from AbortSignal.timeout()) are transient
			// and should be retried, but user-initiated aborts (AbortError)
			// should not.
		} else if (!(err instanceof TypeError)) {
			throw err;
		}

		logger.debug(chalk.dim(`Retrying API call after error...`));
		logger.debug(err);

		if (attempts <= 1) {
			throw err;
		}

		await setTimeout(backoff, undefined, { signal: abortSignal });
		return retryOnAPIFailure(action, backoff + 1000, attempts - 1, abortSignal);
	}
}
