/**
 * Creates a basic debounced function that delays invoking `fn` until after
 * `delayMs` milliseconds have elapsed since the last time the debounced
 * function was invoked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
	fn: T,
	delayMs = 100
): (...args: Parameters<T>) => void {
	let crrTimeoutId: NodeJS.Timeout | undefined;

	return (...args: Parameters<T>) => {
		if (crrTimeoutId) {
			clearTimeout(crrTimeoutId);
		}

		crrTimeoutId = setTimeout(() => {
			fn(...args);
		}, delayMs);
	};
}
