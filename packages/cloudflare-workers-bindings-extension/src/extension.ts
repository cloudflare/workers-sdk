import * as vscode from "vscode";

export async function activate(context: vscode.ExtensionContext) {
	vscode.commands.registerCommand(
		"cloudflare-workers-bindings-extension.testCommand",
		() =>
			vscode.window.showInformationMessage(`Successfully called test command.`)
	);
}
