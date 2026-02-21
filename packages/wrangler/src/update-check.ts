import checkForUpdate from "update-check";
import {
	name as wranglerName,
	version as wranglerVersion,
} from "../package.json";
import type { Result } from "update-check";

async function doUpdateCheck(): Promise<string | undefined> {
	// Allow overriding the latest version for testing purposes
	// This is useful for testing the agentic version warning without waiting for a real update
	const fakeVersion = process.env.__WRANGLER_TEST_FAKE_LATEST_VERSION__;
	if (fakeVersion) {
		return fakeVersion;
	}

	let update: Result | null = null;
	// `check-update` only requires the name and version to check. This way we
	// don't have to bundle the entire `package.json` in the final build.
	const pkg = { name: wranglerName, version: wranglerVersion };
	try {
		// default cache for update check is 1 day
		update = await checkForUpdate(pkg, {
			distTag: pkg.version.startsWith("0.0.0") ? "beta" : "latest",
		});
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
