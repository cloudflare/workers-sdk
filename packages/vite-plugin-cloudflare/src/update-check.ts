import checkForUpdate from "update-check";
import type { Result } from "update-check";

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
