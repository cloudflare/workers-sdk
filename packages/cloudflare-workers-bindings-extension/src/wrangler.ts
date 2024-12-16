import * as path from "path";

export function importWrangler(
	workspaceRoot: string
): typeof import("wrangler") {
	const wrangler = path.join(
		path.join(
			workspaceRoot,
			"node_modules",
			"wrangler",
			"wrangler-dist",
			"cli.js"
		)
	);

	try {
		return require(wrangler);
	} catch {
		throw new Error("No Wrangler version bundled");
	}
}
