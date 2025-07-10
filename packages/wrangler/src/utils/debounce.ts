/**
 * Creates a basic debounced function that delays invoking `fn` until after
 * `delayMs` milliseconds have elapsed since the last time the debounced
 * function was invoked.
 */
export function debounce(fn: () => void, delayMs = 100) {
	let crrTimeoutId: NodeJS.Timeout | undefined;

	return () => {
		if (crrTimeoutId) {
			clearTimeout(crrTimeoutId);
		}

		crrTimeoutId = setTimeout(() => {
			fn();
		}, delayMs);
	};
}
