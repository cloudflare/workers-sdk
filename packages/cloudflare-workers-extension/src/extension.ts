import { execSync } from "child_process";
import path from "path";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
	const watcher = vscode.workspace.createFileSystemWatcher("**/wrangler.toml");

	watcher.onDidChange((uri) => {
		const wranglerPath = path.join(
			path.dirname(uri.fsPath),
			"node_modules/.bin/wrangler"
		);
		console.log(
			`wrangler.toml (${uri.fsPath}) changed. Running ${wranglerPath} types --x-include-runtime`
		);

		execSync(
			`${wranglerPath} types ${path.resolve(path.dirname(uri.fsPath), "./.wrangler/types/env.d.ts")} --x-include-runtime`,
			{
				cwd: path.dirname(uri.fsPath),
			}
		);
	});

	context.subscriptions.push(watcher);
}
