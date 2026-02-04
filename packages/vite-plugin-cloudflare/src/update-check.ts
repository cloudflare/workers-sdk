import checkForUpdate from "update-check";
import type { Result } from "update-check";

/**
 * Checks if a newer version of the vite-plugin-cloudflare package is available.
 *
 * This function dynamically imports the package.json to get the current version,
 * then uses the `update-check` library to query npm for the latest version.
 * The dist tag used for comparison depends on the current version - "beta" for
 * pre-release versions (0.0.0-*) and "latest" for stable versions.
 *
 * @returns The latest available version string if an update is available, or `undefined` if the package is up-to-date or the check fails
 */
async function doUpdateCheck(): Promise<string | undefined> {
	let update: Result | null = null;
	// Use dynamic import with JSON assertion to avoid bundler issues
	const pkg = (
		await import("../package.json", {
			with: { type: "json" },
		})
	).default;
	try {
		// default cache for update check is 1 day
		update = await checkForUpdate(
			{ name: pkg.name, version: pkg.version },
			{
				distTag: pkg.version.startsWith("0.0.0") ? "beta" : "latest",
			}
		);
	} catch {
		// ignore error
	}
	return update?.latest;
}

// Memoise update check promise, so we can call this multiple times as required
// without having to prop drill the result. It's unlikely to change through the
// process lifetime.
let updateCheckPromise: Promise<string | undefined>;
export function updateCheck(): Promise<string | undefined> {
	return (updateCheckPromise ??= doUpdateCheck());
}
