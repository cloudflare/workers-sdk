import { fetchLatestNpmVersion } from "@cloudflare/workers-utils";
import {
	name as wranglerName,
	version as wranglerVersion,
} from "../package.json";
import type { NpmVersionCheckResult } from "@cloudflare/workers-utils";

// Memoise update check promise, so we can call this multiple times as required
// without having to prop drill the result. It's unlikely to change through the
// process lifetime.
let updateCheckPromise: Promise<NpmVersionCheckResult>;

/**
 * Checks if a newer version of `wrangler` is available on npm.
 *
 * The result is memoised so the check is only performed once per process
 * lifetime — callers can invoke this freely without worrying about redundant
 * network requests.
 *
 * @returns A discriminated result indicating whether an update is available,
 *   the package is already up-to-date, or the check failed
 */
export function updateCheck(): Promise<NpmVersionCheckResult> {
	return (updateCheckPromise ??= fetchLatestNpmVersion(
		wranglerName,
		wranglerVersion
	));
}
