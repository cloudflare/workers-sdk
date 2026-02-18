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
