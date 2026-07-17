import { getInstalledVersionsFromLockfile } from "./lockfiles-resolution";
import { getInstalledPackageVersionFromNodeModules } from "./node-modules";
import type { LockfileCache } from "./lockfiles-resolution";

/**
 * Gets the exact version of an npm package installed in a project.
 *
 * Resolution strategy (first match wins):
 * 1. **Lockfile** — looks up the version in the nearest parseable lockfile
 *    (pnpm-lock.yaml, package-lock.json, yarn.lock, or bun.lock). When a
 *    {@link LockfileCache} is provided via `opts.cache`, the lockfile is
 *    parsed once and subsequent lookups are O(1).
 *    Aliases (npm: protocol, vite+, etc.) are intentionally excluded from
 *    lockfile results so they fall through to the node_modules path, which
 *    handles vite's `bundledVersions` convention correctly.
 * 2. **node_modules** — resolves the package via `require.resolve`, reads
 *    its `package.json`, and returns `version` (with special-case handling
 *    for vite+ `bundledVersions`).
 *
 * @param packageName - The name of the target package
 * @param projectPath - The path of the project to check
 * @param opts - Options
 * @param opts.stopAtProjectPath - If `true`, stop walking up at the project's path
 * @param opts.cache - A caller-owned {@link LockfileCache} for memoization.
 *                     When provided, parsed lockfile results are stored and
 *                     re-used from this map. When omitted, every call
 *                     re-reads and re-parses the lockfile.
 * @returns The installed version string, or `undefined` if the package is not installed
 */
export function getInstalledPackageVersion(
	packageName: string,
	projectPath: string,
	opts: {
		stopAtProjectPath?: boolean;
		cache?: LockfileCache;
	} = {}
): string | undefined {
	// Fast path: consult the lockfile first (O(1) per lookup when cache is provided)
	const lockfileVersions = getInstalledVersionsFromLockfile(projectPath, {
		cache: opts.cache,
		stopAtProjectPath: opts.stopAtProjectPath,
	});
	const lockfileVersion = lockfileVersions?.get(packageName);
	if (lockfileVersion) {
		return lockfileVersion;
	}

	// Fallback: resolve from node_modules (handles aliases, bundledVersions, etc.)
	return getInstalledPackageVersionFromNodeModules(
		packageName,
		projectPath,
		opts
	);
}
