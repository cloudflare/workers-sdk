import { existsSync, readFileSync } from "fs";
import * as path from "path";
import * as vscode from "vscode";

export function importWrangler(
	workspaceRoot: string
): typeof import("wrangler") | undefined {
	const wrangler = path.join(
		workspaceRoot,
		"node_modules",
		"wrangler",
		"wrangler-dist",
		"cli.js"
	);
	if (!existsSync(wrangler)) {
		vscode.window.showErrorMessage(
			"Cannot find Wrangler. Have you run `npm install` in your project directory?"
		);
		return;
	}
	const packageJsonPath = path.join(
		workspaceRoot,
		"node_modules",
		"wrangler",
		"package.json"
	);
	const wranglerVersion = JSON.parse(readFileSync(packageJsonPath, "utf8"))
		.version as string;

	const isPreRelease = wranglerVersion.startsWith("0.0.0");
	const major = parseInt(wranglerVersion.split(".")[0]);
	const minor = parseInt(wranglerVersion.split(".")[1]);
	// min version is 3.99.0 (and there were no patches for 3.99.0)
	// will probably need to update this to whatever one --x-provision is released on :')
	if ((major < 3 && !isPreRelease) || (major === 3 && minor < 99)) {
		vscode.commands.executeCommand(
			"setContext",
			"ext.unsupportedWrangler",
			true
		);
		return;
	}
	vscode.commands.executeCommand(
		"setContext",
		"ext.unsupportedWrangler",
		false
	);
	return require(wrangler);
}
