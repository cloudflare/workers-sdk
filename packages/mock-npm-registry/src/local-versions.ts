/**
 * The dist-tag that local copies of dependency packages are published under.
 *
 * They aren't published as `latest`, so that `<name>@latest` still resolves
 * to the public npm release.
 */
export const LOCAL_DIST_TAG = "local";

/**
 * The manifest fields whose entries are installed alongside a package, and
 * therefore must point at the local versions of other local packages.
 */
const DEPENDENCY_FIELDS = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
] as const;

export type PackageManifest = {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	[field: string]: unknown;
};

/** A package's real version and the version it is published under locally. */
export type LocalVersion = { from: string; to: string };

/**
 * Create the version for a local copy of a package.
 *
 * Unreleased workspace packages share their version with the latest npm
 * release. Publishing them under that version would mean that any public
 * package which pins it exactly (such as `cf`, which pins `@cloudflare/config`)
 * gets the local, possibly breaking, copy.
 *
 * Appending a prerelease suffix to the real version isn't enough: a range that
 * includes a prerelease, such as `^5.20261113.0-beta`, also matches any later
 * prerelease of the same version, such as `5.20261113.0-beta.local`. So, like
 * Changesets snapshot versions, local copies are published as `0.0.0-<tag>`
 * prereleases, which no range for the real version can match. The real version
 * is kept in the prerelease identifiers so that it stays readable.
 *
 * @param version The package's real version, such as `1.2.3` or `1.2.3-beta`.
 * @returns `0.0.0-local.<version>`, such as `0.0.0-local.1.2.3-beta`.
 */
export function getLocalVersion(version: string): string {
	return `0.0.0-local.${version}`;
}

/**
 * Point a packed manifest at the local versions of local packages.
 *
 * `pnpm pack` has already replaced each `workspace:*` specifier with the
 * dependency's exact real version, so any dependency on a renamed package must
 * still be that version. Anything else (a range, or an alias) can't be safely
 * rewritten, so it is reported as an error rather than left pointing at npm.
 *
 * @param manifest The `package.json` contents from a packed tarball.
 * @param localVersions The renamed packages, keyed by name.
 * @returns A copy of the manifest with the local versions applied.
 */
export function rewriteManifest(
	manifest: PackageManifest,
	localVersions: ReadonlyMap<string, LocalVersion>
): PackageManifest {
	const result: PackageManifest = { ...manifest };

	const own = localVersions.get(manifest.name);
	if (own) {
		if (manifest.version !== own.from) {
			throw new Error(
				`Expected ${manifest.name} to be version ${own.from}, found ${manifest.version}`
			);
		}
		result.version = own.to;
	}

	for (const field of DEPENDENCY_FIELDS) {
		const dependencies = manifest[field];
		if (dependencies === undefined) {
			continue;
		}
		const rewritten = { ...dependencies };
		for (const [name, specifier] of Object.entries(dependencies)) {
			const local = localVersions.get(name);
			if (local === undefined) {
				continue;
			}
			if (specifier !== local.from) {
				throw new Error(
					`${manifest.name} has ${field} "${name}": "${specifier}", ` +
						`but the local copy of ${name} can only replace the exact version ${local.from}. ` +
						`Use a "workspace:*" specifier for local packages.`
				);
			}
			rewritten[name] = local.to;
		}
		result[field] = rewritten;
	}

	return result;
}
