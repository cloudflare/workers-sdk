import * as vscode from "vscode";
import { importWrangler } from "./wrangler";

export async function activate(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand(
		"cloudflare-workers-bindings-extension.testCommand",
		() =>
			vscode.window.showInformationMessage(`Successfully called test command.`)
	);

	const rootPath =
		vscode.workspace.workspaceFolders &&
		vscode.workspace.workspaceFolders.length > 0
			? vscode.workspace.workspaceFolders[0].uri.fsPath
			: undefined;

	if (!rootPath) {
		return;
	}

	const wrangler = importWrangler(rootPath);

	// Do stuff with Wrangler
}
