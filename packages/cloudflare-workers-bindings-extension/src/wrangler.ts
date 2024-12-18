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

// Finds the first wrangler config file in the workspace and parse it
export async function getConfigUri(): Promise<vscode.Uri | null> {
	const [configUri] = await vscode.workspace.findFiles(
		"wrangler.{toml,jsonc,json}",
		null,
		1
	);
	return configUri;
}
