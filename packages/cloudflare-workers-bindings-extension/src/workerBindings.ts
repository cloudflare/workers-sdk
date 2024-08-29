import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export class DepNodeProvider implements vscode.TreeDataProvider<Dependency> {
	private _onDidChangeTreeData: vscode.EventEmitter<
		Dependency | undefined | void
	> = new vscode.EventEmitter<Dependency | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | void> =
		this._onDidChangeTreeData.event;

	constructor(private workspaceRoot: string | undefined) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Dependency): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Dependency): Thenable<Dependency[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage("No dependency in empty workspace");
			return Promise.resolve([]);
		}

		if (element) {
			return Promise.resolve(
				this.getDepsInPackageJson(
					path.join(
						this.workspaceRoot,
						"node_modules",
						element.label,
						"package.json"
					)
				)
			);
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

		const { unstable_getMiniflareWorkerOptions } = await import(wrangler);

		console.log(path.join(this.workspaceRoot!, "wrangler.toml"));
		const options = await unstable_getMiniflareWorkerOptions(
			path.join(this.workspaceRoot!, "wrangler.toml")
		);
		console.log(options.workerOptions);

		return [
			...Object.entries(options.workerOptions.bindings).map(
				([n, v]) =>
					new Dependency(n, "variable", vscode.TreeItemCollapsibleState.None, {
						command: "extension.openPackageOnNpm",
						title: "",
						arguments: [n],
					})
			),
			...Object.entries(options.workerOptions.r2Buckets).map(
				([n, v]) =>
					new Dependency(n, "r2", vscode.TreeItemCollapsibleState.None, {
						command: "extension.openPackageOnNpm",
						title: "",
						arguments: [n],
					})
			),
		];
	}

	/**
	 * Given the path to package.json, read all its dependencies and devDependencies.
	 */
	private getDepsInPackageJson(packageJsonPath: string): Dependency[] {
		const workspaceRoot = this.workspaceRoot;
		if (this.pathExists(packageJsonPath) && workspaceRoot) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

			const toDep = (moduleName: string, version: string): Dependency => {
				if (
					this.pathExists(path.join(workspaceRoot, "node_modules", moduleName))
				) {
					return new Dependency(
						moduleName,
						version,
						vscode.TreeItemCollapsibleState.Collapsed
					);
				} else {
					return new Dependency(
						moduleName,
						version,
						vscode.TreeItemCollapsibleState.None,
						{
							command: "extension.openPackageOnNpm",
							title: "",
							arguments: [moduleName],
						}
					);
				}
			};

			const deps = packageJson.dependencies
				? Object.keys(packageJson.dependencies).map((dep) =>
						toDep(dep, packageJson.dependencies[dep])
					)
				: [];
			const devDeps = packageJson.devDependencies
				? Object.keys(packageJson.devDependencies).map((dep) =>
						toDep(dep, packageJson.devDependencies[dep])
					)
				: [];
			return deps.concat(devDeps);
		} else {
			return [];
		}
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

export class Dependency extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		private readonly version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);

		this.tooltip = `${this.label}-${this.version}`;
		this.description = this.version;
	}

	iconPath = {
		light: path.join(
			__filename,
			"..",
			"..",
			"resources",
			"light",
			"dependency.svg"
		),
		dark: path.join(
			__filename,
			"..",
			"..",
			"resources",
			"dark",
			"dependency.svg"
		),
	};

	contextValue = "dependency";
}
