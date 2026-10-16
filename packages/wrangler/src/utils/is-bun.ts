/**
 * Returns whether Wrangler is running in the Bun runtime.
 *
 * @returns Whether Wrangler is running in the Bun runtime.
 */
export function isBun(): boolean {
	return !!process.versions.bun;
}
