import { setTimeout } from "node:timers/promises";
import { APIError } from "./parse";
import type { Logger } from "./logger";

const MAX_ATTEMPTS = 3;

export async function retryOnAPIFailure<T>(
	action: () => T | Promise<T>,
	logger: Logger,
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

		logger.debug(`Retrying API call after error...`);
		logger.debug(err);

		if (attempts <= 1) {
			throw err;
		}

		await setTimeout(backoff, undefined, { signal: abortSignal });
		return retryOnAPIFailure(
			action,
			logger,
			backoff + 1000,
			attempts - 1,
			abortSignal
		);
	}
}
