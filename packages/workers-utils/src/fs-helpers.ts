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
 * Recursively remove a directory with retries for Windows compatibility.
 *
 * On Windows, `workerd` (and other processes) may not release file handles
 * immediately after disposal, causing `EBUSY` errors. Node.js's built-in
 * `maxRetries` option handles `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`,
 * and `EPERM` errors with automatic backoff retries.
 *
 * @param dirPath The directory path to remove
 */
export async function removeDir(dirPath: string): Promise<void> {
	await fs.promises.rm(dirPath, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}

/**
 * Synchronously and recursively remove a directory with retries for Windows compatibility.
 *
 * @see {@link removeDir} for the async version and rationale.
 *
 * @param dirPath The directory path to remove
 */
export function removeDirSync(dirPath: string): void {
	fs.rmSync(dirPath, {
		recursive: true,
		force: true,
		maxRetries: 5,
		retryDelay: 100,
	});
}
