import * as vscode from "vscode";
import { CFS } from "./cfs";
import {
	Channel,
	FromQuickEditMessage,
	ToQuickEditMessage,
	WorkerLoadedMessage,
} from "./ipc";

export function activate(context: vscode.ExtensionContext) {
	const channel = Channel<FromQuickEditMessage, ToQuickEditMessage>(
		context.messagePassingProtocol!
	);
	const cfs = new CFS(channel);
	context.subscriptions.push(cfs);
	vscode.commands.executeCommand("workbench.action.closeAllEditors");

	channel.onMessage(async (data) => {
		if (data.type === "WorkerLoaded") {
			console.log("WorkerLoaded", data.body);
			await cfs.seed(data.body);
			vscode.commands.executeCommand(
				"vscode.open",
				vscode.Uri.parse(`cfs:/${data.body.name}/${data.body.entrypoint}`),
				{ preview: false }
			);
		}
	});
}

export function deactivate() {}
