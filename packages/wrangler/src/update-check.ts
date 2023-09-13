import checkForUpdate from "update-check";
import pkg from "../package.json";
import type { Result } from "update-check";

export async function updateCheck(): Promise<string | undefined> {
	let update: Result | null = null;
	try {
		// default cache for update check is 1 day
		update = await checkForUpdate(pkg, {
			distTag: pkg.version.startsWith("0.0.0") ? "beta" : "latest",
		});
	} catch (err) {
		// ignore error
	}
	return update?.latest;
}
