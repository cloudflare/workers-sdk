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

		return new Promise((accept) => {
			setTimeout(
				() => accept(retryOnError(action, backoff, attempts - 1)),
				backoff
			);
		});
	}
}
