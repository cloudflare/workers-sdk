import path from "node:path";
import { findUpSync } from "find-up";
import { getWranglerTmpDir } from "../paths";
import type { BundleResult } from "../deployment-bundle/bundle";

export const RUNNING_BUILDERS: BundleResult[] = [];

export const CLEANUP_CALLBACKS: (() => void)[] = [];
export const CLEANUP = () => {
	CLEANUP_CALLBACKS.forEach((callback) => callback());
	RUNNING_BUILDERS.forEach((builder) => builder.stop?.());
};

export function isUrl(maybeUrl?: string): maybeUrl is string {
	if (!maybeUrl) {
		return false;
	}

	try {
		new URL(maybeUrl);
		return true;
	} catch (e) {
		return false;
	}
}

// Wrangler's tests change `process.cwd()` to be a different temporary directory
// for each test. We want to invalidate our `projectRootCache` and `tmpDirCache`
// if this changes, so store the `cwd` and `projectRoot` used to compute each
// cache, and recompute when requested if it's different.

let projectRootCacheCwd: string | undefined;
let projectRootCache: string | undefined;

let tmpDirCacheProjectRoot: string | undefined;
let tmpDirCache: string | undefined;

/**
 * Returns the "project root" for the current process. Normally, this would be
 * the directory containing the config file, but Pages doesn't really have a
 * config file, so we use the closest directory containing a `package.json`
 * instead. If no `package.json` file could be found, we just use the current
 * working directory.
 */
export function getPagesProjectRoot(): string {
	const cwd = process.cwd();
	if (projectRootCache !== undefined && projectRootCacheCwd === cwd) {
		return projectRootCache;
	}
	const packagePath = findUpSync("package.json");
	projectRootCache = packagePath ? path.dirname(packagePath) : process.cwd();
	projectRootCacheCwd = cwd;
	return projectRootCache;
}

/**
 * Returns the temporary directory to use for the current process. This uses
 * `getWranglerTmpDir()` to create a temporary directory in the project's
 * `.wrangler` folder to avoid issues with different drive letters on Windows.
 *
 * Normally, we'd create a temporary directory at program startup as required,
 * but Pages uses a temporary directory in lots of places (including default
 * arguments for functions), so passing it around would be a bit messy. We also
 * want to minimise the number of temporary directories we create. Pages has
 * code to append random identifiers at the end of files names it creates, so
 * reusing the directory is fine.
 */
export function getPagesTmpDir(): string {
	const projectRoot = getPagesProjectRoot();
	if (tmpDirCache !== undefined && tmpDirCacheProjectRoot === projectRoot) {
		return tmpDirCache;
	}
	const tmpDir = getWranglerTmpDir(getPagesProjectRoot(), "pages");
	tmpDirCache = tmpDir.path;
	tmpDirCacheProjectRoot = projectRoot;
	return tmpDirCache;
}

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
