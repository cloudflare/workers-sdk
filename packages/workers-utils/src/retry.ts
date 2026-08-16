import { setTimeout } from "node:timers/promises";
import { APIError } from "./parse";
import type { Logger } from "./logger";

const MAX_ATTEMPTS = 3;

// Cap how long we'll block on a `Retry-After` header before failing fast.
const MAX_RETRY_AFTER_MS = 60_000;

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
			abortSignal
		);
	}
}
