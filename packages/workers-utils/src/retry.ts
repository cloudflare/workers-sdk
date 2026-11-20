import { setTimeout } from "node:timers/promises";
import { APIError } from "./parse";
import type { Logger } from "./logger";

const MAX_ATTEMPTS = 3;

// Cap how long we'll block on a `Retry-After` header before failing fast.
const MAX_RETRY_AFTER_MS = 60_000;

// "The requested Worker version could not be found". The API can also return
// this for a version whose upload has only just succeeded.
const WORKER_VERSION_NOT_FOUND_CODE = 100146;

// New versions have been seen to stay unreadable for around 30 seconds. The
// linear backoff in `retryOnAPIFailure()` spreads these attempts over ~55 seconds.
const UNREADABLE_VERSION_ATTEMPTS = 12;

/**
 * Runs an API call, retrying it when it fails with a transient error.
 *
 * @param action The API call to run
 * @param logger Logger used to report retries
 * @param backoff Milliseconds to wait before the first retry; each later retry waits a second longer
 * @param attempts Maximum number of times to run `action`
 * @param abortSignal Cancels the wait between attempts
 * @param shouldRetry Decides which errors to retry, instead of retrying the transient ones
 * @returns The result of `action`
 */
export async function retryOnAPIFailure<T>(
	action: () => T | Promise<T>,
	logger: Logger,
	backoff = 0,
	attempts = MAX_ATTEMPTS,
	abortSignal?: AbortSignal,
	shouldRetry?: (err: unknown) => boolean
): Promise<T> {
	try {
		return await action();
	} catch (err) {
		if (shouldRetry !== undefined) {
			if (!shouldRetry(err)) {
				throw err;
			}
		} else if (err instanceof APIError) {
			// 429 is special-cased here rather than folded into isRetryable(),
			// since other callers rely on that meaning "5xx".
			if (!err.isRetryable() && err.status !== 429) {
				throw err;
			}
		} else if (err instanceof DOMException && err.name === "TimeoutError") {
			// Per-request timeouts (from AbortSignal.timeout()) are transient
			// and should be retried, but user-initiated aborts (AbortError)
			// should not.
		} else if (!(err instanceof TypeError)) {
			throw err;
		}

		const retryAfterMs = err instanceof APIError ? err.retryAfterMs : undefined;

		// Fail fast rather than blocking for an unreasonable amount of time.
		if (retryAfterMs !== undefined && retryAfterMs > MAX_RETRY_AFTER_MS) {
			throw err;
		}

		if (attempts <= 1) {
			throw err;
		}

		// Honour `Retry-After` when present, otherwise retry immediately and
		// 429s after a short wait
		const jitter = Math.random() * 1000;

		let wait = backoff;
		if (retryAfterMs !== undefined) {
			wait = retryAfterMs + jitter;
		} else if (err instanceof APIError && err.status === 429) {
			// never immediately retry a 429, wait at least 1s
			wait = Math.max(backoff, 1000) + jitter;
		}

		if (retryAfterMs !== undefined) {
			logger.info(
				`Received a "Retry-After" header from the Cloudflare API. Waiting ${Math.ceil(retryAfterMs / 1000)} second(s) before retrying...`
			);
		} else {
			logger.debug(`Retrying API call after error...`);
			logger.debug(err);
		}

		await setTimeout(wait, undefined, { signal: abortSignal });
		return retryOnAPIFailure(
			action,
			logger,
			backoff + 1000,
			attempts - 1,
			abortSignal,
			shouldRetry
		);
	}
}

/**
 * Reads a Worker version, retrying while the API reports that it cannot be
 * found.
 *
 * A version can be temporarily unreadable after its upload has succeeded. A
 * version that really does not exist is only reported once the retries run
 * out, so use this where the version is expected to exist. Any other error is
 * thrown straight away, so that it is not given the same long wait.
 *
 * @param action Reads the Worker version
 * @param logger Logger used to report retries
 * @returns The result of `action`
 */
export function retryOnUnreadableVersion<T>(
	action: () => T | Promise<T>,
	logger: Logger
): Promise<T> {
	let hasReportedWait = false;

	return retryOnAPIFailure(
		action,
		logger,
		undefined,
		UNREADABLE_VERSION_ATTEMPTS,
		undefined,
		(err) => {
			if (
				!(err instanceof APIError) ||
				err.code !== WORKER_VERSION_NOT_FOUND_CODE
			) {
				return false;
			}

			// Retries are otherwise only logged at debug level, which would leave
			// a wait of up to a minute unexplained.
			if (!hasReportedWait) {
				hasReportedWait = true;
				logger.info(
					"The Cloudflare API could not find a Worker version. A version can be unreadable for a short time after it is uploaded, so retrying for up to a minute..."
				);
			}

			return true;
		}
	);
}
