import * as jsoncParser from "jsonc-parser";

/**
 * Parses a bun.lock file (JSONC format) and extracts dependency versions.
 *
 * Package entries in `bun.lock` are keyed by package name, with the value
 * being a tuple where the first element is `"name@version"`.
 *
 * @param content - Raw JSONC content of the bun.lock file
 * @returns A map of package names to resolved versions
 */
export function parseBunLockfile(content: string): Map<string, string> {
	const lockfile = jsoncParser.parse(content) as BunLockfile;
	const versions = new Map<string, string>();

	if (!lockfile?.packages) {
		return versions;
	}

	for (const [key, entry] of Object.entries(lockfile.packages)) {
		if (!Array.isArray(entry) || entry.length === 0) {
			continue;
		}
		const resolvedId = entry[0] as string;
		if (typeof resolvedId !== "string") {
			continue;
		}

		// resolvedId format: "name@version" or "@scope/name@version"
		const resolvedName = extractBunPackageName(resolvedId);
		const version = extractBunPackageVersion(resolvedId);

		if (!version) {
			continue;
		}

		// Alias detection: the key differs from the resolved package name
		if (resolvedName && resolvedName !== key) {
			continue;
		}

		versions.set(key, version);
	}

	return versions;
}

/**
 * Extracts the package name from a bun resolved ID string.
 *
 * @param resolvedId - A string like `"lodash@4.17.21"` or `"@scope/pkg@1.0.0"`
 * @returns The package name portion
 */
function extractBunPackageName(resolvedId: string): string | undefined {
	const lastAt = resolvedId.lastIndexOf("@");
	if (lastAt <= 0) {
		return undefined;
	}
	return resolvedId.slice(0, lastAt);
}

/**
 * Extracts the version from a bun resolved ID string.
 *
 * @param resolvedId - A string like `"lodash@4.17.21"` or `"@scope/pkg@1.0.0"`
 * @returns The version portion
 */
function extractBunPackageVersion(resolvedId: string): string | undefined {
	const lastAt = resolvedId.lastIndexOf("@");
	if (lastAt <= 0) {
		return undefined;
	}
	return resolvedId.slice(lastAt + 1);
}

interface BunLockfile {
	packages?: Record<string, unknown[]>;
}
