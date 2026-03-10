import fs from "node:fs";

/**
 * Returns whether the given path is a directory
 *
 * Note: this function never throws; if the path does not exist or is inaccessible, it returns false.
 *
 * @param path The file system path to check
 * @returns `true` if the path is a directory, `false` otherwise
 */
export function isDirectory(path: string) {
	return fs.statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/**
 * Recursively remove a directory without waiting for completion or throwing any errors.
 *
 * @param dirPath The directory path to remove
 * @param options An object with a `fireAndForget` property set to `true`
 * @return `void` - the removal is fire-and-forget with errors suppressed
 */
export function removeDir(
	dirPath: string,
	{ fireAndForget }: { fireAndForget: true }
): void;

/**
 * Recursively remove a directory with retries for Windows compatibility.
 *
 * @param dirPath The directory path to remove
 * @param options An optional object with a `fireAndForget` property set to `false`, if defined
 * @return `Promise<void>` - resolves when the removal is complete, or rejects if the removal fails
 */
export function removeDir(
	dirPath: string,
	options?: { fireAndForget?: false }
): Promise<void>;

export function removeDir(
	dirPath: string,
	{ fireAndForget = false }: { fireAndForget?: boolean } = {}
): Promise<void> | void {
	// On Windows, `workerd` (and other processes) may not release file handles
	// immediately after disposal, causing `EBUSY` errors. Node.js's built-in
	// `maxRetries` option handles `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`,
	// and `EPERM` errors with automatic backoff retries.

	// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- this is the helper itself
	const result = fs.promises.rm(dirPath, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
	if (fireAndForget) {
		// Don't wait for the promise, and silently swallow errors by handling if rejected
		void result.catch(() => {});
	} else {
		return result;
	}
}

/**
 * Synchronously and recursively remove a directory, with retries for Windows compatibility.
 *
 * @see {@link removeDir} for the async version and rationale.
 *
 * @param dirPath The directory path to remove
 * @throws If the removal fails after retries, an error will be thrown
 */
export function removeDirSync(dirPath: string): void {
	// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- this is the helper itself
	fs.rmSync(dirPath, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}
