import { getInstalledVersionsFromLockfile } from "../../../src/package-resolution/lockfiles-resolution";

/**
 * Convenience wrapper that calls {@link getInstalledVersionsFromLockfile}
 * with caching disabled, so each test gets a fresh parse.
 *
 * @param projectPath - Absolute path to the project directory
 * @returns A map of package names to resolved versions, or `undefined`
 */
export function resolveFromLockFile(projectPath: string) {
	return getInstalledVersionsFromLockfile(projectPath, { cache: false });
}
