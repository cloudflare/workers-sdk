import { fetchLatestNpmVersion } from "@cloudflare/workers-utils";
import type { NpmVersionCheckResult } from "@cloudflare/workers-utils";

// Memoise update check promise, so we can call this multiple times as required
// without having to prop drill the result. It's unlikely to change through the
// process lifetime.
let updateCheckPromise: Promise<NpmVersionCheckResult>;

/**
 * Checks if a newer version of `@cloudflare/vite-plugin` is available on npm.
 *
 * The result is memoised so the check is only performed once per process
 * lifetime — callers can invoke this freely without worrying about redundant
 * network requests.
 *
 * @returns A discriminated result indicating whether an update is available,
 *   the package is already up-to-date, or the check failed
 */
export function checkForNpmUpdate(): Promise<NpmVersionCheckResult> {
	return (updateCheckPromise ??= (async () => {
		try {
			const pkg = (
				await import("../package.json", {
					with: { type: "json" },
				})
			).default;
			return fetchLatestNpmVersion(pkg.name, pkg.version);
		} catch {
			return { status: "failed" };
		}
	})());
}
