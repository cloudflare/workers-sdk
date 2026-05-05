import { fetchLatestNpmVersion } from "@cloudflare/workers-utils";

// Memoise update check promise, so we can call this multiple times as required
// without having to prop drill the result. It's unlikely to change through the
// process lifetime.
let updateCheckPromise: Promise<string | undefined>;

/**
 * Checks if a newer version of `@cloudflare/vite-plugin` is available on npm.
 *
 * The result is memoised so the check is only performed once per process
 * lifetime — callers can invoke this freely without worrying about redundant
 * network requests.
 *
 * @returns The latest available version string if an update exists, or `undefined` if up-to-date or the check fails
 */
export function checkForNpmUpdate(): Promise<string | undefined> {
	return (updateCheckPromise ??= (async () => {
		try {
			const pkg = (
				await import("../package.json", {
					with: { type: "json" },
				})
			).default;
			return fetchLatestNpmVersion(pkg.name, pkg.version);
		} catch {
			return undefined;
		}
	})());
}
