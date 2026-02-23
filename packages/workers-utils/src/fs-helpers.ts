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
 * On Windows, `workerd` (and other processes) may not release file handles
 * immediately after disposal, causing `EBUSY` errors. Node.js's built-in
 * `maxRetries` option handles `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`,
 * and `EPERM` errors with automatic backoff retries.
 *
 * When `fireAndForget: true` is specified, this function returns `void` (the removal
 * is fire-and-forget with errors suppressed).
 *
 * @param dirPath The directory path to remove
 */
export function removeDir(
	dirPath: string,
	{ fireAndForget }: { fireAndForget: true }
): void;

/**
 * Recursively remove a directory with retries for Windows compatibility.
 *
 * On Windows, `workerd` (and other processes) may not release file handles
 * immediately after disposal, causing `EBUSY` errors. Node.js's built-in
 * `maxRetries` option handles `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`,
 * and `EPERM` errors with automatic backoff retries.
 *
 * When `fireAndForget` is not specified or set to `false`, this function returns
 * a `Promise<void>` that will reject if the removal fails.
 *
 *
 * @param dirPath The directory path to remove
 */
export function removeDir(
	dirPath: string,
	options?: { fireAndForget?: false }
): Promise<void>;

export function removeDir(
	dirPath: string,
	{ fireAndForget = false }: { fireAndForget?: boolean } = {}
): Promise<void> | void {
	// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- this is the helper itself
	const result = fs.promises.rm(dirPath, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
	if (fireAndForget) {
		// Silently swallow errors by catching and returning a resolved promise
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
