import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export class DepNodeProvider implements vscode.TreeDataProvider<Binding> {
	private _onDidChangeTreeData: vscode.EventEmitter<
		Binding | undefined | void
	> = new vscode.EventEmitter<Binding | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Binding | undefined | void> =
		this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string | undefined) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Binding): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Binding): Thenable<Binding[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage("No dependency in empty workspace");
			return Promise.resolve([]);
		}

		if (element) {
			return Promise.resolve([]);
		} else {
			return this.getFromWranglerConfig();
		}
	}

	private async getFromWranglerConfig() {
		const wrangler = path.join(
			path.join(
				this.workspaceRoot!,
				"node_modules",
				"wrangler",
				"wrangler-dist",
				"cli.js"
			)
		);

		const { unstable_getMiniflareWorkerOptions } = require(wrangler);

		console.log(path.join(this.workspaceRoot!, "wrangler.toml"));
		// TODO: multiroot workspaces
		const options = await unstable_getMiniflareWorkerOptions(
			path.join(this.workspaceRoot!, "wrangler.toml")
		);
		console.log(options.workerOptions);

		function bindings(from: any, name: string, icon: string) {
			return Object.entries(from).map(
				([n, v]) =>
					new Binding(
						n,
						name,
						vscode.TreeItemCollapsibleState.None,
						{
							command: "extension.openPackageOnNpm",
							title: "",
							arguments: [n],
						},
						icon
					)
			);
		}

		return [
			...bindings(options.workerOptions.bindings, "text", "workers"),
			...bindings(options.workerOptions.r2Buckets, "r2", "r2"),
			...bindings(options.workerOptions.kvNamespaces, "kv", "kv"),
		];
	}

	private pathExists(p: string): boolean {
		try {
			fs.accessSync(p);
		} catch (err) {
			return false;
		}

		return true;
	}
}

export class Binding extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command: vscode.Command,
		type?: string
	) {
		super(label, collapsibleState);

		this.tooltip = `${this.label}-${this.version}`;
		this.description = this.version;

		this.iconPath = path.join(
			__filename,
			"..",
			"..",
			"resources",
			"icons",
			(type ?? "workers") + ".svg"
		);
	}

	contextValue = "dependency";
}
