/**
 * Wraps a promise to ensure it takes at least a minimum amount of time.
 * Useful for preventing "flash" loading states when operations complete too quickly.
 *
 * @param promise - The promise to wrap
 * @param minMs - Minimum time in milliseconds (default: 300)
 *
 * @returns The result of the original promise, after at least minMs has elapsed
 */
export async function withMinimumDelay<T>(
	promise: Promise<T>,
	minMs = 300
): Promise<T> {
	const [result] = await Promise.all([
		promise,
		new Promise((resolve) => setTimeout(resolve, minMs)),
	]);

	return result;
}
