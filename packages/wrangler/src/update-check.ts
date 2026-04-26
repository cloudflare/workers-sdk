import { doUpdateCheck } from "@cloudflare/workers-utils";
import {
	name as wranglerName,
	version as wranglerVersion,
} from "../package.json";

// Memoise update check promise, so we can call this multiple times as required
// without having to prop drill the result. It's unlikely to change through the
// process lifetime.
let updateCheckPromise: Promise<string | undefined>;

/**
 * Checks if a newer version of `wrangler` is available on npm.
 *
 * The result is memoised so the check is only performed once per process
 * lifetime — callers can invoke this freely without worrying about redundant
 * network requests.
 *
 * @returns The latest available version string if an update exists, or `undefined` if up-to-date or the check fails
 */
export function updateCheck(): Promise<string | undefined> {
	return (updateCheckPromise ??= doUpdateCheck(wranglerName, wranglerVersion));
}
