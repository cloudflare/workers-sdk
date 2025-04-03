import * as vscode from "vscode";
import { addBindingFlow } from "./add-binding";
import { HomeViewProvider } from "./home";
import { BindingsProvider, Node } from "./show-bindings";

export type Result = {
	bindingsProvider: BindingsProvider;
};

export async function activate(
	context: vscode.ExtensionContext
): Promise<Result> {
	// A tree data provider that returns all the bindings data from the workspace
	const bindingsProvider = new BindingsProvider();
	// Register the tree view to list bindings
	const bindingsView = vscode.window.registerTreeDataProvider(
		"cloudflare-workers-bindings",
		bindingsProvider
	);

	// Watch for config file changes
	const watcher = vscode.workspace.createFileSystemWatcher(
		"**/wrangler.{toml,jsonc,json}"
	);

	// Refresh the bindings when the wrangler config file changes
	watcher.onDidChange(() => bindingsProvider.refresh());
	watcher.onDidCreate(() => bindingsProvider.refresh());
	watcher.onDidDelete(() => bindingsProvider.refresh());

	// Register the refresh command, which is also used by the bindings view
	const refreshCommand = vscode.commands.registerCommand(
		"cloudflare-workers-bindings.refresh",
		() => bindingsProvider.refresh()
	);

	// Register the add bindings command
	const addBindingCommand = vscode.commands.registerCommand(
		"cloudflare-workers-bindings.addBinding",
		async () => {
			await addBindingFlow(context);
		}
	);

	const openDocsCommand = vscode.commands.registerCommand(
		"cloudflare-workers-bindings.openDocs",
		async (node: Node) => {
			const docs: Record<string, string> = {
				d1_databases: "https://developers.cloudflare.com/d1/",
				r2_buckets: "https://developers.cloudflare.com/r2/",
				kv_namespaces: "https://developers.cloudflare.com/kv/",
			};
			if (node.type === "binding") {
				vscode.env.openExternal(vscode.Uri.parse(docs[node.name]));
			}
		}
	);

	const webviewProvider = new HomeViewProvider(context);
	const homeWebView = vscode.window.registerWebviewViewProvider(
		HomeViewProvider.viewType,
		webviewProvider
	);

	//  Cleanup when the extension is deactivated
	context.subscriptions.push(
		bindingsView,
		watcher,
		refreshCommand,
		addBindingCommand,
		openDocsCommand,
		homeWebView
	);

	return {
		bindingsProvider,
	};
}
