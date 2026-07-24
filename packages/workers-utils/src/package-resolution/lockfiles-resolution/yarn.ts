import { parse as yarnLockfileParse } from "@yarnpkg/lockfile";
import { parse as parseYaml } from "yaml";

/**
 * Parses a yarn.lock file (either classic v1 or Berry v2+) and extracts
 * dependency versions.
 *
 * Format detection uses the `__metadata` key (present in Berry) or the
 * `# yarn lockfile v1` header (classic).
 *
 * @param content - Raw content of the yarn.lock file
 * @returns A map of package names to resolved versions
 */
export function parseYarnLockfile(content: string): Map<string, string> {
	// Berry v2+ lockfiles are valid YAML and contain a `__metadata` key.
	// Classic v1 lockfiles start with a comment header and use a custom format.
	if (content.includes("__metadata:")) {
		return parseYarnBerryLockfile(content);
	}
	return parseYarnClassicLockfile(content);
}

/**
 * Parses a Yarn Berry (v2+) lockfile, which is valid YAML.
 *
 * Keys have the form `"name@npm:^1.0.0"` (or multiple comma-separated
 * descriptors). Versions are in the `version` property.
 *
 * @param content - Raw YAML content
 * @returns A map of package names to resolved versions
 */
function parseYarnBerryLockfile(content: string): Map<string, string> {
	const lockfile = parseYaml(content) as Record<
		string,
		{ version?: string; resolution?: string }
	>;
	const versions = new Map<string, string>();

	for (const [key, entry] of Object.entries(lockfile)) {
		if (key === "__metadata" || !entry?.version) {
			continue;
		}

		// Key format: "name@npm:^1.0.0" or "name@npm:^1.0.0, name@npm:^2.0.0"
		// For scoped packages: "@scope/name@npm:^1.0.0"
		// Take the first descriptor if there are multiple
		const descriptor = key.split(", ")[0];
		const pkgName = extractYarnBerryPackageName(descriptor);
		if (!pkgName) {
			continue;
		}

		// Alias detection: if the resolution field names a different package,
		// skip this entry so it falls back to node_modules
		if (entry.resolution) {
			const resolvedName = extractYarnBerryPackageName(entry.resolution);
			if (resolvedName && resolvedName !== pkgName) {
				continue;
			}
		}

		// Only set the first occurrence — later entries with different ranges
		// that resolve to the same package would overwrite otherwise
		if (!versions.has(pkgName)) {
			versions.set(pkgName, entry.version);
		}
	}

	return versions;
}

/**
 * Extracts the package name from a Yarn Berry descriptor or resolution string.
 *
 * Descriptor format: `"name@npm:^1.0.0"` or `"@scope/name@npm:^1.0.0"`
 * Resolution format: `"name@npm:1.0.0"` or `"@scope/name@npm:1.0.0"`
 *
 * @param descriptor - A Yarn Berry descriptor string
 * @returns The package name, or `undefined` if the format is unrecognised
 */
function extractYarnBerryPackageName(descriptor: string): string | undefined {
	const npmIndex = descriptor.indexOf("@npm:");
	if (npmIndex === -1) {
		return undefined;
	}
	// For "@scope/name@npm:..." npmIndex is after the scoped name
	// For "name@npm:..." npmIndex is after the bare name
	const name = descriptor.slice(0, npmIndex);
	return name || undefined;
}

/**
 * Parses a Yarn Classic (v1) lockfile using the `@yarnpkg/lockfile` library.
 *
 * Keys have the form `"name@^1.0.0"` (or multiple comma-separated specifiers).
 * For scoped packages: `"@scope/name@^1.0.0"`.
 *
 * @param content - Raw lockfile content (custom Yarn v1 format)
 * @returns A map of package names to resolved versions
 */
function parseYarnClassicLockfile(content: string): Map<string, string> {
	const result = yarnLockfileParse(content);
	const versions = new Map<string, string>();

	if (result.type !== "success") {
		return versions;
	}

	for (const [key, entry] of Object.entries(result.object)) {
		if (!entry.version) {
			continue;
		}

		// Key format: "name@^1.0.0" or "@scope/name@^1.0.0"
		// Multiple specifiers are kept as a single grouped key by
		// @yarnpkg/lockfile (e.g. "name@^1.0.0, name@^2.0.0"); they all
		// resolve to the same package/version, so split and use the first.
		//
		// Alias format: "alias-name@npm:real-name@^1.0.0"
		if (key.includes("@npm:")) {
			continue;
		}

		const descriptor = key.split(", ")[0];
		const pkgName = extractYarnClassicPackageName(descriptor);
		if (pkgName && !versions.has(pkgName)) {
			versions.set(pkgName, entry.version);
		}
	}

	return versions;
}

/**
 * Extracts the package name from a Yarn Classic lockfile key.
 *
 * Key format: `"name@^1.0.0"` or `"@scope/name@^1.0.0"`
 *
 * For scoped packages, the first `@` is part of the scope, so the version
 * specifier starts at the *last* `@` sign.
 *
 * @param key - A Yarn Classic lockfile entry key
 * @returns The package name, or `undefined` if the format is invalid
 */
function extractYarnClassicPackageName(key: string): string | undefined {
	// Remove surrounding quotes if present
	const cleaned = key.replace(/^"|"$/g, "");
	const lastAt = cleaned.lastIndexOf("@");
	if (lastAt <= 0) {
		return undefined;
	}
	return cleaned.slice(0, lastAt);
}
