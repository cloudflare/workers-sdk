import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBunLockfile } from "./bun";
import { findLockfile } from "./discovery";
import { parseNpmLockfile } from "./npm";
import { parsePnpmLockfile } from "./pnpm";
import { parseYarnLockfile } from "./yarn";
import type { LockfileName } from "./discovery";

/**
 * A caller-owned memoization cache for parsed lockfile version maps.
 *
 * Keyed by `lockfilePath + "\0" + projectPath` so that different workspace
 * packages sharing the same pnpm lockfile each get their own entry (pnpm
 * lockfiles use per-importer dependency maps). The null byte separator
 * cannot appear in file paths, so the composite key is unambiguous.
 *
 * Create one at the call-site that makes repeated lookups (e.g. the loop
 * in `collectPackageDependencies`) and pass it via `opts.cache`. The cache
 * is then garbage-collected when the owning function returns, avoiding
 * module-level mutable state.
 */
export type LockfileCache = Map<string, Map<string, string>>;

/**
 * Resolves installed package versions from the nearest lockfile.
 *
 * Walks up the directory tree from `projectPath` to locate a lockfile
 * (pnpm-lock.yaml, package-lock.json, yarn.lock, or bun.lock), parses it,
 * and returns a `Map<packageName, exactVersion>` for the project's
 * top-level dependencies.
 *
 * When a `cache` Map is provided, results are memoized per lockfile path
 * and project path, so repeated per-package lookups within a single
 * operation (e.g. inside `collectPackageDependencies`) are O(1) after the
 * initial parse. The caller owns the cache lifetime.
 *
 * @param projectPath - Absolute path to the project directory
 * @param opts - Options
 * @param opts.cache - A caller-owned {@link LockfileCache} for memoization.
 *                     When provided, parsed results are stored and re-used
 *                     from this map. When omitted, every call re-reads and
 *                     re-parses the lockfile.
 * @param opts.stopAtProjectPath - If `true`, do not search for lockfiles
 *                                 above `projectPath`. Prevents a monorepo root
 *                                 lockfile from being used when only the
 *                                 project-local lockfile should be consulted.
 * @returns A map of package names to their resolved versions, or
 *          `undefined` if no parseable lockfile is found
 */
export function getInstalledVersionsFromLockfile(
	projectPath: string,
	opts: { cache?: LockfileCache; stopAtProjectPath?: boolean } = {}
): Map<string, string> | undefined {
	const found = findLockfile(projectPath, {
		last: opts.stopAtProjectPath === true ? projectPath : undefined,
	});
	if (!found) {
		return undefined;
	}

	const { lockfilePath, name } = found;
	const cacheStore = opts.cache;

	if (cacheStore) {
		const cacheKey = `${lockfilePath}\0${projectPath}`;
		const cached = cacheStore.get(cacheKey);
		if (cached) {
			return cached;
		}

		const versions = parseLockfile(lockfilePath, name, projectPath);
		if (versions) {
			cacheStore.set(cacheKey, versions);
		}
		return versions;
	}

	// No cache provided — parse fresh every time
	return parseLockfile(lockfilePath, name, projectPath);
}

/**
 * Reads and parses a lockfile, dispatching to the correct parser based on
 * the lockfile name.
 *
 * @param lockfilePath - Absolute path to the lockfile
 * @param name - The lockfile filename (determines which parser to use)
 * @param projectPath - The project directory (used for pnpm importer key)
 * @returns A map of package names to resolved versions, or `undefined` on
 *          parse failure
 */
function parseLockfile(
	lockfilePath: string,
	name: LockfileName,
	projectPath: string
): Map<string, string> | undefined {
	try {
		const content = readFileSync(lockfilePath, "utf-8");
		const lockfileDir = path.dirname(lockfilePath);
		// Normalize to forward slashes, pnpm lockfiles always use POSIX
		// separators for importer keys, but `path.relative` uses backslashes
		// on Windows.
		const importerKey =
			path.relative(lockfileDir, projectPath).replaceAll("\\", "/") || ".";

		switch (name) {
			case "package-lock.json":
				return parseNpmLockfile(content);
			case "pnpm-lock.yaml":
				return parsePnpmLockfile(content, importerKey);
			case "yarn.lock":
				return parseYarnLockfile(content);
			case "bun.lock":
				return parseBunLockfile(content);
		}
	} catch {
		// Parse failure → return undefined so the caller can fall back
		return undefined;
	}
}
