import { parse as parseYaml } from "yaml";

/**
 * Parses a pnpm-lock.yaml and extracts dependency versions for a specific
 * workspace importer.
 *
 * Supports lockfileVersion 5.x, 6.x, and 9.x. Strips peer-dependency
 * suffixes like `1.2.3(react@18)` (v6+) or `1.2.3_react@16.8.0` (v5)
 * to extract the bare version.
 *
 * **v6/v9** — dependencies are listed under `importers.<key>.dependencies`
 * and `importers.<key>.devDependencies` with `{ specifier, version }` entries.
 *
 * **v5 single-project** — there is no `importers` key. Dependencies sit at
 * the top-level `dependencies`/`devDependencies` maps (values are plain
 * version strings) and alias information is in a separate top-level
 * `specifiers` map.
 *
 * @param content - Raw YAML content of the lockfile
 * @param importerKey - The importer path relative to the lockfile root
 *                      (e.g. "." for the root, "packages/foo" for a sub-package)
 * @returns A map of package names to resolved versions
 */
export function parsePnpmLockfile(
	content: string,
	importerKey: string
): Map<string, string> {
	const lockfile = parseYaml(content) as PnpmLockfile;
	const versions = new Map<string, string>();

	const importer = lockfile.importers?.[importerKey];
	if (importer) {
		// v6/v9 path — entries have { specifier, version } shape
		const allDeps = {
			...importer.dependencies,
			...importer.devDependencies,
		};

		for (const [pkgName, entry] of Object.entries(allDeps)) {
			// Skip aliases: specifier starts with "npm:" (e.g. npm:@types/node@^22)
			if (entry.specifier?.startsWith("npm:")) {
				continue;
			}
			// Skip workspace/file links
			if (
				entry.version?.startsWith("link:") ||
				entry.version?.startsWith("file:")
			) {
				continue;
			}
			const version = stripPnpmPeerSuffix(entry.version);
			if (version) {
				versions.set(pkgName, version);
			}
		}

		return versions;
	}

	// v5 single-project fallback — no `importers` key; deps are top-level
	// plain string maps. Only applies to the root importer (".").
	if (
		importerKey === "." &&
		(lockfile.dependencies || lockfile.devDependencies)
	) {
		const allDeps: Record<string, string> = {
			...lockfile.dependencies,
			...lockfile.devDependencies,
		};

		for (const [pkgName, rawVersion] of Object.entries(allDeps)) {
			// Skip aliases: specifier starts with "npm:" (e.g. npm:react@^18)
			if (lockfile.specifiers?.[pkgName]?.startsWith("npm:")) {
				continue;
			}
			// Skip workspace/file links
			if (rawVersion.startsWith("link:") || rawVersion.startsWith("file:")) {
				continue;
			}
			// Skip pnpm path-form entries like "/react/18.2.0"
			if (rawVersion.startsWith("/")) {
				continue;
			}
			const version = stripPnpmPeerSuffix(rawVersion);
			if (version) {
				versions.set(pkgName, version);
			}
		}
	}

	return versions;
}

/**
 * Strips the peer-dependency suffix from a pnpm version string.
 *
 * **v6+** appends peer info in parentheses:
 *   `"4.1.0(@types/node@22.15.17)(esbuild@0.28.1)"` → `"4.1.0"`
 *
 * **v5** uses an underscore separator:
 *   `"1.2.3_react@16.8.0"` → `"1.2.3"`
 *
 * This function cuts at whichever separator appears first. This is safe
 * because semantic version strings never contain `_` or `(`.
 *
 * @param version - The raw version string from a pnpm lockfile
 * @returns The bare semver version, or `undefined` if the input is falsy
 */
function stripPnpmPeerSuffix(version: string | undefined): string | undefined {
	if (!version) {
		return undefined;
	}
	const parenIndex = version.indexOf("(");
	const underscoreIndex = version.indexOf("_");

	// Find the earliest separator, ignoring -1 (not found)
	let cutAt = -1;
	if (parenIndex !== -1 && underscoreIndex !== -1) {
		cutAt = Math.min(parenIndex, underscoreIndex);
	} else if (parenIndex !== -1) {
		cutAt = parenIndex;
	} else if (underscoreIndex !== -1) {
		cutAt = underscoreIndex;
	}

	return cutAt === -1 ? version : version.slice(0, cutAt);
}

interface PnpmLockfile {
	lockfileVersion?: string;
	importers?: Record<
		string,
		{
			dependencies?: Record<string, { specifier?: string; version?: string }>;
			devDependencies?: Record<
				string,
				{ specifier?: string; version?: string }
			>;
		}
	>;
	/** v5 single-project: top-level deps as plain `name: version` strings */
	dependencies?: Record<string, string>;
	/** v5 single-project: top-level devDeps as plain `name: version` strings */
	devDependencies?: Record<string, string>;
	/** v5: maps package names to their original specifiers (e.g. `"^4.17.21"` or `"npm:react@^18"`) */
	specifiers?: Record<string, string>;
}
