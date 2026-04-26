import checkForUpdate from "update-check";
import type { Result } from "update-check";

// Safety-net timeout for the update check network request.
// The `update-check` library has its own 2s socket timeout, but if the first
// request gets a 4xx it retries with auth — potentially doubling the wait.
// This caps the total wall-clock time for the entire operation.
const UPDATE_CHECK_TIMEOUT_MS = 3000;

/**
 * Checks if a newer version of a package is available on npm.
 *
 * Uses the `update-check` library to query the npm registry for the latest
 * version. The dist tag used for comparison depends on the current version —
 * "beta" for pre-release versions (0.0.0-*) and "latest" for stable versions.
 *
 * @param name - The npm package name to check
 * @param version - The currently installed version
 * @returns The latest available version string if an update is available, or `undefined` if the package is up-to-date or the check fails
 */
export async function doUpdateCheck(
	name: string,
	version: string
): Promise<string | undefined> {
	let update: Result | null = null;
	try {
		// Race with a timeout as a safety net — the library's own 2s socket
		// timeout handles most cases, but the auth-retry path can take up to 4s.
		update = await Promise.race([
			checkForUpdate(
				{ name, version },
				{
					distTag: version.startsWith("0.0.0") ? "beta" : "latest",
				}
			),
			new Promise<null>((resolve) => {
				const timer = setTimeout(() => resolve(null), UPDATE_CHECK_TIMEOUT_MS);
				// Don't let the orphaned timer prevent process exit
				timer.unref();
			}),
		]);
	} catch {
		// ignore error
	}
	return update?.latest;
}
