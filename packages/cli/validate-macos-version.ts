import os from "node:os";

/**
 * Validates that the current macOS version supports workerd.
 * Throws an error if running on macOS below version 13.5.
 */
export function validateMacOSVersion(): void {
	if (process.platform !== "darwin") {
		return;
	}

	if (process.env.CI === "true") {
		return;
	}

	const release = os.release();
	const macOSVersion = darwinVersionToMacOSVersion(release);

	if (macOSVersion && isVersionLessThan(macOSVersion, "13.5.0")) {
		throw new Error(
			`Unsupported macOS version: The Cloudflare Workers runtime cannot run on the current version of macOS (${macOSVersion}). ` +
				`The minimum requirement is macOS 13.5+. See https://github.com/cloudflare/workerd?tab=readme-ov-file#running-workerd ` +
				`If you cannot upgrade your version of macOS, you could try running create-cloudflare/wrangler in a DevContainer setup with Linux.`
		);
	}
}

/**
 * Converts Darwin kernel version to macOS version.
 * Darwin 21.x.x = macOS 12.x (Monterey)
 * Darwin 22.x.x = macOS 13.x (Ventura)
 * Darwin 23.x.x = macOS 14.x (Sonoma)
 * etc.
 */
function darwinVersionToMacOSVersion(darwinVersion: string): string | null {
	const match = darwinVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!match) {
		return null;
	}

	const major = parseInt(match[1], 10);

	if (major >= 20) {
		const macOSMajor = major - 9;
		const minor = parseInt(match[2], 10);
		const patch = parseInt(match[3], 10);
		return `${macOSMajor}.${minor}.${patch}`;
	}

	return null;
}

/**
 * Simple semver comparison for major.minor.patch versions
 */
function isVersionLessThan(version1: string, version2: string): boolean {
	const [major1, minor1, patch1] = version1.split(".").map(Number);
	const [major2, minor2, patch2] = version2.split(".").map(Number);

	if (major1 !== major2) {
		return major1 < major2;
	}
	if (minor1 !== minor2) {
		return minor1 < minor2;
	}
	return patch1 < patch2;
}
