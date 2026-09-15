/**
 * Creates a basic debounced function that delays invoking `fn` until after
 * `delayMs` milliseconds have elapsed since the last time the debounced
 * function was invoked.
 *
 * The returned function has a `cancel()` method that discards a pending
 * invocation, which callers should use when they are shutting down so that
 * `fn` cannot run after their resources have been disposed.
 */
export function debounce(fn: () => void, delayMs = 100) {
	let crrTimeoutId: NodeJS.Timeout | undefined;

	const debounced = () => {
		if (crrTimeoutId) {
			clearTimeout(crrTimeoutId);
		}

		crrTimeoutId = setTimeout(() => {
			crrTimeoutId = undefined;
			fn();
		}, delayMs);
	};

	debounced.cancel = () => {
		if (crrTimeoutId) {
			clearTimeout(crrTimeoutId);
			crrTimeoutId = undefined;
		}
	};

	return debounced;
}
