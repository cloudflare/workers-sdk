import os from "node:os";
import { UserError } from "@cloudflare/workers-utils";

/**
 * Minimum macOS version required for workerd compatibility.
 */
const MINIMUM_MACOS_VERSION = "13.5.0";

/**
 * Checks the current macOS version for workerd compatibility.
 *
 * This function is a no-op on non-Darwin platforms and in CI environments.
 *
 * @param options - Configuration object
 * @param options.shouldThrow - If true, throws an error on unsupported versions. If false, logs a warning.
 */
export function checkMacOSVersion(options: { shouldThrow: boolean }): void {
	if (process.platform !== "darwin") {
		return;
	}

	if (process.env.CI) {
		return;
	}

	const release = os.release();
	const macOSVersion = darwinVersionToMacOSVersion(release);

	if (macOSVersion && isVersionLessThan(macOSVersion, MINIMUM_MACOS_VERSION)) {
		if (options.shouldThrow) {
			throw new UserError(
				`Unsupported macOS version: The Cloudflare Workers runtime cannot run on the current version of macOS (${macOSVersion}). ` +
					`The minimum requirement is macOS ${MINIMUM_MACOS_VERSION}+. See https://github.com/cloudflare/workerd?tab=readme-ov-file#running-workerd ` +
					`If you cannot upgrade your version of macOS, you could try running in a DevContainer setup with a supported version of Linux (glibc 2.35+ required).`
			);
		} else {
			// eslint-disable-next-line no-console
			console.warn(
				`⚠️  Warning: Unsupported macOS version detected (${macOSVersion}). ` +
					`The Cloudflare Workers runtime may not work correctly on macOS versions below ${MINIMUM_MACOS_VERSION}. ` +
					`Consider upgrading to macOS ${MINIMUM_MACOS_VERSION}+ or using a DevContainer setup with a supported version of Linux (glibc 2.35+ required).`
			);
		}
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
 * Simple semver comparison for major.minor.patch versions.
 * Validates that both versions follow the M.m.p format before comparison.
 */
function isVersionLessThan(version1: string, version2: string): boolean {
	const versionRegex = /^(\d+)\.(\d+)\.(\d+)$/;

	const match1 = version1.match(versionRegex);
	const match2 = version2.match(versionRegex);

	if (!match1 || !match2) {
		throw new Error(
			`Invalid version format. Expected M.m.p format, got: ${version1}, ${version2}`
		);
	}

	const [major1, minor1, patch1] = [
		parseInt(match1[1], 10),
		parseInt(match1[2], 10),
		parseInt(match1[3], 10),
	];
	const [major2, minor2, patch2] = [
		parseInt(match2[1], 10),
		parseInt(match2[2], 10),
		parseInt(match2[3], 10),
	];

	if (major1 !== major2) {
		return major1 < major2;
	}
	if (minor1 !== minor2) {
		return minor1 < minor2;
	}
	return patch1 < patch2;
}
