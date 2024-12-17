import * as path from "path";

// import * as wrangler from "wrangler";

export function importWrangler(
	workspaceRoot: string
): typeof import("wrangler") {
	const wranglerPath = path.join(
		workspaceRoot,
		"node_modules",
		"wrangler",
		"wrangler-dist",
		"cli.js"
	);

	// try {
	return require(wranglerPath);
	// } catch {
	// 	return wrangler;
	// }
}
