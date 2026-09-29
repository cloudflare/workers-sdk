export const MINIMUM_WRANGLER_VERSION = "4.143.0";
export const MINIMUM_VITE_PLUGIN_VERSION = "1.62.0";
const SEMVER_PATTERN =
	/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Returns whether a stable package version meets the minimum version. */
export function isVersionSupported(
	version: string,
	minimumVersion: string
): boolean {
	const match = SEMVER_PATTERN.exec(version);
	if (!match || match[4]) {
		return false;
	}

	const installed = match.slice(1, 4).map((part) => Number.parseInt(part, 10));
	const minimum = minimumVersion
		.split(".")
		.map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < minimum.length; index += 1) {
		if (installed[index] !== minimum[index]) {
			return installed[index] > minimum[index];
		}
	}

	return true;
}
