import * as vscode from "vscode";
import { CFS } from "./cfs";
import { Channel } from "./ipc";
import type { FromQuickEditMessage, ToQuickEditMessage } from "./ipc";

export function activate(context: vscode.ExtensionContext) {
	if (context.messagePassingProtocol) {
		const channel = new Channel<FromQuickEditMessage, ToQuickEditMessage>(
			context.messagePassingProtocol
		);
		const cfs = new CFS(channel);
		context.subscriptions.push(cfs);
		void vscode.commands.executeCommand("workbench.action.closeAllEditors");

		// Create setEntrypoint customisation with the right click menu
		context.subscriptions.push(
			vscode.commands.registerCommand(
				"extension.setEntrypoint",
				async (event: vscode.Uri) => {
					const filePath =
						event.path ?? vscode.window.activeTextEditor?.document.fileName;

					if (filePath) {
						channel.postMessage({
							type: "SetEntryPoint",
							body: {
								path: filePath,
							},
						});
					}
				}
			)
		);

		channel.onMessage(async (data) => {
			if (data.type === "WorkerLoaded") {
				console.log("WorkerLoaded", data.body);
				await cfs.seed(data.body);
				void vscode.commands.executeCommand(
					"vscode.open",
					vscode.Uri.parse(`cfs:/${data.body.name}/${data.body.entrypoint}`),
					{ preview: false }
				);
			}
		});
	} else {
		throw new Error("MessagePort required");
	}
}

export function deactivate() {}
