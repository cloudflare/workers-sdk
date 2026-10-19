/**
 * Returns whether this process is running in the Bun runtime.
 *
 * @returns Whether this process is running in the Bun runtime.
 */
export function isBun(): boolean {
	return !!process.versions.bun;
}
