/**
 * Generic npm update-check helper.
 *
 * Wraps the `update-check` library with a safety-net timeout and a per-
 * (name, version) memoization. Used by the shared banner to surface
 * "update available" text without blocking the CLI's first paint.
 *
 * The package's own readFile-based cache hits in <1ms on a warm SSD,
 * so the typical path returns synchronously-fast. The 3s safety-net
 * only fires on the cold-cache + slow-network combo.
 */

import checkForUpdate from "update-check";
import type { Result } from "update-check";

// Safety-net timeout for the update check network request.
// The `update-check` library has its own 2s socket timeout, but if the
// first request gets a 4xx it retries with auth — potentially doubling
// the wait. This caps the total wall-clock time for the entire operation.
const UPDATE_CHECK_TIMEOUT_MS = 3000;

async function doUpdateCheck(
	name: string,
	version: string
): Promise<string | undefined> {
	let update: Result | null = null;
	const pkg = { name, version };
	try {
		// Race with a timeout as a safety net — the library's own 2s
		// socket timeout handles most cases, but the auth-retry path can
		// take up to 4s.
		update = await Promise.race([
			checkForUpdate(pkg, {
				distTag: pkg.version.startsWith("0.0.0") ? "beta" : "latest",
			}),
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

// Memoise update check promise per (name, version), so callers can invoke
// `updateCheck()` from multiple sites in the same process without each
// triggering a network roundtrip. The result is unlikely to change
// through a process's lifetime.
const updateCheckPromiseCache = new Map<
	string,
	Promise<string | undefined>
>();

export function updateCheck(
	name: string,
	version: string
): Promise<string | undefined> {
	const key = `${name}@${version}`;
	const cached = updateCheckPromiseCache.get(key);
	if (cached) {
		return cached;
	}
	const promise = doUpdateCheck(name, version);
	updateCheckPromiseCache.set(key, promise);
	return promise;
}
