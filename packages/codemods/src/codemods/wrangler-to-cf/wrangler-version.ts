import { getInstalledPackageVersion } from "@cloudflare/workers-utils";

const MINIMUM_WRANGLER_VERSION = "4.100.0";
const SEMVER_PATTERN =
	/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function isVersionSupported(version: string): boolean {
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
 * Ensures the project can load a generated wrangler.config.ts file.
 *
 * @param projectDirectory Directory containing the Wrangler configuration.
 */
export function assertCompatibleWranglerVersion(
	projectDirectory: string
): void {
	const installedVersion = getInstalledPackageVersion(
		"wrangler",
		projectDirectory
	);
	if (installedVersion && isVersionSupported(installedVersion)) {
		return;
	}

	const detectedVersion = installedVersion
		? `Detected version ${installedVersion}.`
		: "No local Wrangler installation was found.";
	throw new Error(
		`Generating wrangler.config.ts requires wrangler ${MINIMUM_WRANGLER_VERSION} or newer because earlier versions do not export wrangler/experimental-config. ${detectedVersion} Update Wrangler and retry the migration.`
	);
}
