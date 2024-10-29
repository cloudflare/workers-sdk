import { setTimeout } from "node:timers/promises";

export async function retryOnError<T>(
	action: () => T | Promise<T>,
	backoff = 2_000,
	attempts = 3
): Promise<T> {
	try {
		return await action();
	} catch (err) {
		if (attempts <= 1) {
			throw err;
		}

		await setTimeout(backoff);
		return retryOnError(action, backoff, attempts - 1);
	}
}
