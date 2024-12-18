import * as path from "path";
import * as vscode from "vscode";

export function importWrangler(
	workspaceRoot: string
): typeof import("wrangler") {
	const wrangler = path.join(
		workspaceRoot,
		"node_modules",
		"wrangler",
		"wrangler-dist",
		"cli.js"
	);

	return require(wrangler);
}
