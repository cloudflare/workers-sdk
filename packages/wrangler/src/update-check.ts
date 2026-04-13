import checkForUpdate from "update-check";
import {
	name as wranglerName,
	version as wranglerVersion,
} from "../package.json";
import type { Result } from "update-check";

// Safety-net timeout for the update check network request.
// The `update-check` library has its own 2s socket timeout, but if the first
// request gets a 4xx it retries with auth — potentially doubling the wait.
// This caps the total wall-clock time for the entire operation.
const UPDATE_CHECK_TIMEOUT_MS = 3000;

async function doUpdateCheck(): Promise<string | undefined> {
	let update: Result | null = null;
	const pkg = { name: wranglerName, version: wranglerVersion };
	try {
		// Race with a timeout as a safety net — the library's own 2s socket
		// timeout handles most cases, but the auth-retry path can take up to 4s.
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

// Memoise update check promise, so we can call this multiple times as required
// without having to prop drill the result. It's unlikely to change through the
// process lifetime.
let updateCheckPromise: Promise<string | undefined>;
export function updateCheck(): Promise<string | undefined> {
	return (updateCheckPromise ??= doUpdateCheck());
}
