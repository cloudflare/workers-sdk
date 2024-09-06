import crypto from "crypto";
import path from "path";
import * as vscode from "vscode";
import { getSdk } from "./api";
import { showInputBox, showQuickPick } from "./basicInput";
import { multiStepInput } from "./multiStepInput";
import { quickOpen } from "./quickOpen";
import { Binding, DepNodeProvider } from "./workerBindings";

const encoder = new TextEncoder();
export async function activate(context: vscode.ExtensionContext) {
	const rootPath =
		vscode.workspace.workspaceFolders &&
		vscode.workspace.workspaceFolders.length > 0
			? vscode.workspace.workspaceFolders[0].uri.fsPath
			: undefined;

	// Samples of `window.registerTreeDataProvider`
	const workerBindingsProvider = new DepNodeProvider(rootPath);

	const watcher = vscode.workspace.createFileSystemWatcher("**/wrangler.toml");

	context.subscriptions.push(watcher);
	watcher.onDidChange((uri) => {
		console.log("really changed");
		workerBindingsProvider.refresh();
	}); // listen to files being changed

	vscode.window.registerTreeDataProvider(
		"workerBindings",
		workerBindingsProvider
	);
	vscode.commands.registerCommand("workerBindings.refreshEntry", async () => {
		workerBindingsProvider.refresh();
		console.log(await (await getSdk(rootPath!)).accounts.list());
	});
	vscode.commands.registerCommand("extension.openPackageOnNpm", (moduleName) =>
		vscode.commands.executeCommand(
			"vscode.open",
			vscode.Uri.parse(`https://www.npmjs.com/package/${moduleName}`)
		)
	);
	vscode.commands.registerCommand("workerBindings.addEntry", async () => {
		console.log(await multiStepInput(context, rootPath!));
		// 		let i = 0;
		// 		const bindingtype = await vscode.window.showQuickPick(["kv", "r2", "d1"], {
		// 			placeHolder: "Choose binding type",
		// 			onDidSelectItem: (item) =>
		// 				vscode.window.showInformationMessage(`Focus ${++i}: ${item}`),
		// 		});
		// 		if (bindingtype === undefined) {
		// 			return;
		// 		}
		// 		const result = await vscode.window.showInputBox({
		// 			title: "Binding name?",
		// 			value: "",
		// 			valueSelection: [2, 4],
		// 			placeHolder: "SOME_BINDING_NAME",
		// 			validateInput: (text) => {
		// 				vscode.window.showInformationMessage(`Validating: ${text}`);
		// 				return text.toUpperCase() !== text ? "Not a valid binding name" : null;
		// 			},
		// 		});
		// 		vscode.window.showInformationMessage(`Got: ${bindingtype} (${result})`);

		// 		await vscode.workspace
		// 			.openTextDocument(vscode.Uri.file(path.join(rootPath!, "wrangler.toml")))
		// 			.then((doc) => {
		// 				vscode.window.showTextDocument(doc);
		// 				let text = doc.getText();

		// 				if (bindingtype === "r2") {
		// 					text += `

		// [[r2_buckets]]
		// binding = "${result}"
		// bucket_name = "${crypto.randomUUID()}"`;
		// 				} else if (bindingtype === "kv") {
		// 					text += `

		// [[kv_namespaces]]
		// binding = "${result}"`;
		// 				} else if (bindingtype === "d1") {
		// 					text += `

		// [[d1_databases]]
		// binding = "${result}"
		// database_id = "${crypto.randomUUID()}"`;
		// 				}

		// 				vscode.workspace.fs.writeFile(doc.uri, encoder.encode(text));
		// 			});
	});
	vscode.commands.registerCommand("workerBindings.editEntry", (node: Binding) =>
		vscode.window.showInformationMessage(
			`Successfully called edit entry on ${node.label}.`
		)
	);
	vscode.commands.registerCommand(
		"workerBindings.deleteEntry",
		(node: Binding) =>
			vscode.window.showInformationMessage(
				`Successfully called delete entry on ${node.label}.`
			)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"workerBindings.selectNewBinding",
			async () => {
				const options: {
					[key: string]: (context: vscode.ExtensionContext) => Promise<void>;
				} = {
					showQuickPick,
					showInputBox,
					// @ts-ignore
					multiStepInput,
					quickOpen,
				};
				const quickPick = vscode.window.createQuickPick();
				quickPick.items = Object.keys(options).map((label) => ({ label }));
				quickPick.onDidChangeSelection((selection) => {
					if (selection[0]) {
						options[selection[0].label](context).catch(console.error);
					}
				});
				quickPick.onDidHide(() => quickPick.dispose());
				quickPick.show();
			}
		)
	);
}
