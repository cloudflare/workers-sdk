import { setTimeout } from "node:timers/promises";
import { APIError } from "./parse";
import type { Logger } from "./logger";

const MAX_ATTEMPTS = 3;

// Cap how long we'll block on a `Retry-After` header before failing fast.
const MAX_RETRY_AFTER_MS = 60_000;

const WORKER_VERSION_NOT_FOUND_CODE = 100146;
const VERSION_NOT_READABLE_INITIAL_BACKOFF_MS = 500;
const VERSION_NOT_READABLE_ATTEMPTS = 6;

/**
 * Runs `action`, retrying transient Cloudflare API failures (5xx, 429, timeouts and network errors).
 *
 * @param action - The API call to run.
 * @param logger - Logs each retry.
 * @param backoff - Milliseconds to wait before the first retry; each later retry waits a second longer.
 * @param attempts - Maximum number of times to run `action`.
 * @param abortSignal - Aborts the wait between attempts.
 * @param isAlsoRetryable - Treats further errors as transient, e.g. API error codes for eventually consistent reads.
 * @returns The result of the first successful attempt.
 */
export async function retryOnAPIFailure<T>(
	action: () => T | Promise<T>,
	logger: Logger,
	backoff = 0,
	attempts = MAX_ATTEMPTS,
	abortSignal?: AbortSignal,
	isAlsoRetryable?: (err: unknown) => boolean
): Promise<T> {
	try {
		return await action();
	} catch (err) {
		if (isAlsoRetryable?.(err)) {
			// Retry below.
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
			isAlsoRetryable
		);
	}
}

/**
 * Reads a Worker version that is known to exist, retrying while the API reports it as not found.
 *
 * Reads of a just-uploaded version can alternate between found and not found for a few seconds,
 * so this waits up to about 12 seconds before giving up.
 *
 * @param read - Reads the Worker version.
 * @param logger - Logs each retry.
 * @returns The result of the first successful read.
 */
export function retryWhileVersionNotReadable<T>(
	read: () => Promise<T>,
	logger: Logger
): Promise<T> {
	let loggedRetry = false;
	return retryOnAPIFailure(
		read,
		logger,
		VERSION_NOT_READABLE_INITIAL_BACKOFF_MS,
		VERSION_NOT_READABLE_ATTEMPTS,
		undefined,
		(err) => {
			const notFound =
				err instanceof APIError && err.code === WORKER_VERSION_NOT_FOUND_CODE;
			if (notFound && !loggedRetry) {
				loggedRetry = true;
				logger.info(
					"The Cloudflare API reports the Worker version as not found. Versions can take a few seconds to become readable after an upload, so retrying for up to 12 seconds..."
				);
			}
			return notFound;
		}
	);
}
