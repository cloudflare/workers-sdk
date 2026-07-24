/**
 * Parses an npm package-lock.json and extracts top-level dependency versions.
 *
 * Supports lockfileVersion 1, 2, and 3.
 *
 * @param content - Raw JSON content of the lockfile
 * @returns A map of package names to resolved versions
 */
export function parseNpmLockfile(content: string): Map<string, string> {
	const lockfile = JSON.parse(content) as NpmLockfile;
	const versions = new Map<string, string>();

	if (lockfile.packages) {
		// lockfileVersion 2 or 3 — top-level deps live under "node_modules/<name>"
		for (const [key, entry] of Object.entries(lockfile.packages)) {
			if (!key.startsWith("node_modules/")) {
				continue;
			}
			// Skip nested node_modules (transitive deps stored under a parent)
			// e.g. "node_modules/foo/node_modules/bar" — only keep top-level
			if (key.indexOf("/node_modules/", "node_modules/".length) !== -1) {
				continue;
			}
			// Skip aliases: when `name` is set and differs from the key's package
			// name, this is an npm alias (e.g. "my-react": "npm:react@^18")
			const pkgName = key.slice("node_modules/".length);
			if (entry.name && entry.name !== pkgName) {
				continue;
			}
			if (entry.version) {
				versions.set(pkgName, entry.version);
			}
		}
	} else if (lockfile.dependencies) {
		// lockfileVersion 1 fallback
		for (const [pkgName, entry] of Object.entries(lockfile.dependencies)) {
			// Skip aliases: version starts with "npm:"
			if (entry.version?.startsWith("npm:")) {
				continue;
			}
			if (entry.version) {
				versions.set(pkgName, entry.version);
			}
		}
	}

	return versions;
}

interface NpmLockfile {
	lockfileVersion?: number;
	packages?: Record<string, { version?: string; name?: string }>;
	dependencies?: Record<string, { version?: string }>;
}
