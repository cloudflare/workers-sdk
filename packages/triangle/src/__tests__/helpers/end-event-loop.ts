/**
 * Forces a tick and ensures that all pending promises resolve
 */
export function endEventLoop() {
	return new Promise((resolve) => setImmediate(resolve));
}
