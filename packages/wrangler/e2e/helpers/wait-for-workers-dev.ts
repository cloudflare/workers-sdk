import { setTimeout } from "node:timers/promises";
import { fetch } from "undici";

const WORKERS_DEV_PROPAGATION_TIMEOUT = 60_000;
const INITIAL_RETRY_DELAY = 500;
const MAX_RETRY_DELAY = 5_000;

export async function waitForWorkersDev(url: string) {
	const deadline = Date.now() + WORKERS_DEV_PROPAGATION_TIMEOUT;
	let retryDelay = INITIAL_RETRY_DELAY;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(deadline - Date.now()),
			});
			if (response.status !== 404) {
				return response;
			}
			await response.body?.cancel();
			lastError = new Error(`Workers.dev returned 404 for ${url}`);
		} catch (error) {
			lastError = error;
		}

		const remaining = deadline - Date.now();
		if (remaining > 0) {
			await setTimeout(Math.min(retryDelay, remaining));
			retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
		}
	}

	throw new Error(`Timed out waiting for ${url} to propagate`, {
		cause: lastError,
	});
}
