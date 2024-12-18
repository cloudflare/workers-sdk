import * as vscode from "vscode";
import { getConfigUri, importWrangler } from "./wrangler";

type Config = ReturnType<
	ReturnType<typeof importWrangler>["experimental_readRawConfig"]
>["rawConfig"];

type Node =
	| {
			type: "env";
			config: Config;
			env: string | null;
	  }
	| {
			type: "binding";
			config: Config;
			env: string | null;
			binding: string;
	  }
	| {
			type: "resource";
			config: Config;
			env: string | null;
			binding: string;
			name: string;
			description?: string;
	  };

export class BindingsProvider implements vscode.TreeDataProvider<Node> {
	// Event emitter for refreshing the tree
	private _onDidChangeTreeData: vscode.EventEmitter<
		Node | undefined | null | void
	> = new vscode.EventEmitter<Node | undefined | null | void>();

	// To notify the TreeView that the tree data has changed
	readonly onDidChangeTreeData: vscode.Event<Node | undefined | null | void> =
		this._onDidChangeTreeData.event;

	// To manually refresh the tree
	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(node: Node): vscode.TreeItem {
		switch (node.type) {
			case "env": {
				const item = new vscode.TreeItem(
					node.env ?? "Top-level env",
					vscode.TreeItemCollapsibleState.Expanded
				);

				return item;
			}
			case "binding": {
				return new vscode.TreeItem(
					node.binding,
					vscode.TreeItemCollapsibleState.Expanded
				);
			}
			case "resource": {
				const item = new vscode.TreeItem(
					node.name,
					vscode.TreeItemCollapsibleState.None
				);

				if (node.description) {
					item.description = node.description;
				}

				return item;
			}
		}
	}

	async getChildren(node?: Node): Promise<Node[]> {
		if (!node) {
			const config = await getWranglerConfig();

			if (!config) {
				return [];
			}

			const topLevelEnvNode: Node = {
				type: "env",
				config,
				env: null,
			};
			const children: Node[] = [];

			for (const env of Object.keys(config.env ?? {})) {
				const node: Node = {
					...topLevelEnvNode,
					env,
				};
				const grandChildren = await this.getChildren(node);

				// Include the environment only if it has any bindings
				if (grandChildren.length > 0) {
					children.push({
						...topLevelEnvNode,
						env,
					});
				}
			}

			const topLevelEnvChildren = await this.getChildren(topLevelEnvNode);

			if (children.length > 0) {
				// Include top level env only if it has any bindings too
				if (topLevelEnvChildren.length > 0) {
					children.unshift(topLevelEnvNode);
				}

				return children;
			}

			// Skip the top level env if there are no environments
			return topLevelEnvChildren;
		}

		switch (node.type) {
			case "env": {
				const children: Node[] = [];
				const env = node.env ? node.config.env?.[node.env] : node.config;

				if (env?.kv_namespaces && env.kv_namespaces.length > 0) {
					children.push({
						...node,
						type: "binding",
						binding: "KV Namespaces",
					});
				}

				if (env?.r2_buckets && env.r2_buckets.length > 0) {
					children.push({
						...node,
						type: "binding",
						binding: "R2 Buckets",
					});
				}

				if (env?.d1_databases && env.d1_databases.length > 0) {
					children.push({
						...node,
						type: "binding",
						binding: "D1 Databases",
					});
				}

				return children;
			}
			case "binding": {
				const children: Node[] = [];
				const env = node.env ? node.config.env?.[node.env] : node.config;

				switch (node.binding) {
					case "KV Namespaces": {
						for (const kv of env?.kv_namespaces ?? []) {
							children.push({
								...node,
								type: "resource",
								name: kv.binding,
								description: kv.id,
							});
						}
						break;
					}
					case "R2 Buckets": {
						for (const r2 of env?.r2_buckets ?? []) {
							children.push({
								...node,
								type: "resource",
								name: r2.binding,
								description: r2.bucket_name,
							});
						}

						break;
					}
					case "D1 Databases": {
						for (const d1 of env?.d1_databases ?? []) {
							children.push({
								...node,
								type: "resource",
								name: d1.binding,
								description: d1.database_id,
							});
						}
						break;
					}
				}

				return children;
			}
			case "resource":
				return [];
		}
	}
}

// Finds the first wrangler config file in the workspace and parse it
export async function getWranglerConfig(): Promise<Config | null> {
	const configUri = await getConfigUri();
	if (!configUri) {
		return null;
	}
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(configUri);

	if (!workspaceFolder) {
		return null;
	}

	const wrangler = importWrangler(workspaceFolder.uri.fsPath);
	const { rawConfig } = wrangler.experimental_readRawConfig({
		config: configUri.fsPath,
	});

	return rawConfig;
}

export async function getConfigUri(): Promise<vscode.Uri | null> {
	const [configUri] = await vscode.workspace.findFiles(
		"wrangler.{toml,jsonc,json}",
		null,
		1
	);
	return configUri;
}
