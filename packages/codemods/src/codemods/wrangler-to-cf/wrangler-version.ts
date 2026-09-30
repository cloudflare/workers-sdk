import { getInstalledPackageVersion } from "@cloudflare/workers-utils";

// Match the Wrangler version constraint in cf's dev/known-impls.ts.
export const MINIMUM_WRANGLER_VERSION = "4.136.0";
const SEMVER_PATTERN =
	/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const DECLARED_VERSION_PATTERN =
	/^(?:\^|~|>=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/**
 * Checks an installed Wrangler version against the minimum required by cf dev.
 *
 * @param version Exact version of the installed Wrangler package.
 * @returns Whether the version passes the minimum version check.
 */
export function isVersionSupported(version: string): boolean {
	const match = SEMVER_PATTERN.exec(version);
	if (!match) {
		return false;
	}

	const installed = match.slice(1, 4).map((part) => Number.parseInt(part, 10));
	const minimum = MINIMUM_WRANGLER_VERSION.split(".").map((part) =>
		Number.parseInt(part, 10)
	);
	for (let index = 0; index < minimum.length; index += 1) {
		if (installed[index] !== minimum[index]) {
			return installed[index] > minimum[index];
		}
	}

	return match[4] === undefined;
}

/**
 * Selects a Wrangler specifier when its declaration or installation needs updating.
 *
 * @param projectDirectory Directory containing the Worker's package.json.
 * @param declaredVersion Wrangler version, range, or tag declared in package.json.
 * @returns The specifier to install, or undefined when no update is needed.
 */
export function getWranglerUpgradeSpec(
	projectDirectory: string,
	declaredVersion: string
): string | undefined {
	if (declaredVersion === "latest") {
		return declaredVersion;
	}

	const installedVersion = getInstalledPackageVersion(
		"wrangler",
		projectDirectory
	);
	const declaredMinimum = DECLARED_VERSION_PATTERN.exec(declaredVersion)?.[1];
	const declaredCompatible =
		declaredMinimum !== undefined && isVersionSupported(declaredMinimum);
	if (
		declaredCompatible &&
		(installedVersion === undefined || isVersionSupported(installedVersion))
	) {
		return undefined;
	}

	return declaredCompatible ? declaredVersion : `^${MINIMUM_WRANGLER_VERSION}`;
}
