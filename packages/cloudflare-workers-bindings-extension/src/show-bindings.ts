import path from "path";
import * as vscode from "vscode";
import { importWrangler } from "./wrangler";

export type Config = ReturnType<
	NonNullable<ReturnType<typeof importWrangler>>["experimental_readRawConfig"]
>["rawConfig"];

export type Environment = Required<Config>["env"][string];
export const bindingKeys = [
	"kv_namespaces",
	"durable_objects",
	"r2_buckets",
	"d1_databases",
	"ai",
	"analytics_engine_datasets",
	"assets",
	"dispatch_namespaces",
	"queues",
	"browser",
	"hyperdrive",
	"mtls_certificates",
	"services",
	"tail_consumers",
	"vectorize",
	"version_metadata",
	"workflows",
	"pipelines",
	"send_email",
	"logfwdr",
	"vars",
	"unsafe",
] as const;

export type BindingType = (typeof bindingKeys)[number];

type EnvNode = {
	type: "env";
	config: Environment;
	name: string | null;
};

export type BindingNode = Exclude<
	{
		[Name in BindingType]: {
			type: "binding";
			name: Name;
			config: Required<Environment>[Name];
		};
	}[BindingType],
	undefined
>;

type ResourceNode = {
	type: "resource";
	name: string;
	description?: string;
};

export type Node = EnvNode | BindingNode | ResourceNode;

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
					node.name ?? "Top-level env",
					vscode.TreeItemCollapsibleState.Expanded
				);

				return item;
			}
			// this is the header
			case "binding": {
				const item = new vscode.TreeItem(
					friendlyBindingNames[node.name],
					vscode.TreeItemCollapsibleState.Expanded
				);
				const enabledBindings = ["kv_namespaces", "r2_buckets", "d1_databases"];
				if (enabledBindings.includes(node.name)) {
					item.contextValue = "binding";
				}
				item.iconPath = path.join(
					__dirname,
					"../",
					"resources",
					"icons",
					`${node.name}.svg`
				);
				return item;
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
			const wranglerConfig = await getWranglerConfig();

			if (!wranglerConfig) {
				return [];
			}

			const topLevelEnvNode: Node = {
				type: "env",
				name: null,
				config: wranglerConfig,
			};
			const children: Node[] = [];

			for (const [name, config] of Object.entries(wranglerConfig.env ?? {})) {
				const node: Node = {
					type: "env",
					name,
					config,
				};
				const grandChildren = await this.getChildren(node);

				// Include the environment only if it has any bindings
				if (grandChildren.length > 0) {
					children.push(node);
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
				const children: BindingNode[] = [];

				if (hasBinding(node.config.kv_namespaces)) {
					children.push({
						type: "binding",
						name: "kv_namespaces",
						config: node.config.kv_namespaces,
					});
				}

				if (hasBinding(node.config.r2_buckets)) {
					children.push({
						type: "binding",
						name: "r2_buckets",
						config: node.config.r2_buckets,
					});
				}

				if (hasBinding(node.config.d1_databases)) {
					children.push({
						type: "binding",
						name: "d1_databases",
						config: node.config.d1_databases,
					});
				}

				if (hasBinding(node.config.durable_objects?.bindings)) {
					children.push({
						type: "binding",
						name: "durable_objects",
						config: node.config.durable_objects,
					});
				}

				if (hasBinding(node.config.ai)) {
					children.push({
						type: "binding",
						name: "ai",
						config: node.config.ai,
					});
				}

				if (hasBinding(node.config.analytics_engine_datasets)) {
					children.push({
						type: "binding",
						name: "analytics_engine_datasets",
						config: node.config.analytics_engine_datasets,
					});
				}

				if (hasBinding(node.config.browser)) {
					children.push({
						type: "binding",
						name: "browser",
						config: node.config.browser,
					});
				}

				if (hasBinding(node.config.hyperdrive)) {
					children.push({
						type: "binding",
						name: "hyperdrive",
						config: node.config.hyperdrive,
					});
				}

				if (hasBinding(node.config.mtls_certificates)) {
					children.push({
						type: "binding",
						name: "mtls_certificates",
						config: node.config.mtls_certificates,
					});
				}

				if (hasBinding(node.config.services)) {
					children.push({
						type: "binding",
						name: "services",
						config: node.config.services,
					});
				}

				if (hasBinding(node.config.assets)) {
					children.push({
						type: "binding",
						name: "assets",
						config: node.config.assets,
					});
				}

				if (hasBinding(node.config.tail_consumers)) {
					children.push({
						type: "binding",
						name: "tail_consumers",
						config: node.config.tail_consumers,
					});
				}

				if (hasBinding(node.config.vectorize)) {
					children.push({
						type: "binding",
						name: "vectorize",
						config: node.config.vectorize,
					});
				}

				if (hasBinding(node.config.version_metadata)) {
					children.push({
						type: "binding",
						name: "version_metadata",
						config: node.config.version_metadata,
					});
				}

				if (hasBinding(node.config.dispatch_namespaces)) {
					children.push({
						type: "binding",
						name: "dispatch_namespaces",
						config: node.config.dispatch_namespaces,
					});
				}

				if (hasBinding(node.config.queues?.producers)) {
					children.push({
						type: "binding",
						name: "queues",
						config: node.config.queues,
					});
				}

				if (hasBinding(node.config.workflows)) {
					children.push({
						type: "binding",
						name: "workflows",
						config: node.config.workflows,
					});
				}

				if (hasBinding(node.config.send_email)) {
					children.push({
						type: "binding",
						name: "send_email",
						config: node.config.send_email,
					});
				}

				if (hasBinding(node.config.logfwdr)) {
					children.push({
						type: "binding",
						name: "logfwdr",
						config: node.config.logfwdr,
					});
				}

				if (hasBinding(node.config.pipelines)) {
					children.push({
						type: "binding",
						name: "pipelines",
						config: node.config.pipelines,
					});
				}

				if (hasBinding(node.config.vars)) {
					children.push({
						type: "binding",
						name: "vars",
						config: node.config.vars,
					});
				}

				if (hasBinding(node.config.unsafe?.bindings)) {
					children.push({
						type: "binding",
						name: "unsafe",
						config: node.config.unsafe,
					});
				}

				return children;
			}
			case "binding": {
				const children: ResourceNode[] = [];

				switch (node.name) {
					case "kv_namespaces": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.id,
							});
						}
						break;
					}
					case "r2_buckets": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.bucket_name,
							});
						}
						break;
					}
					case "d1_databases": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.database_id,
							});
						}
						break;
					}
					case "assets": {
						children.push({
							type: "resource",
							name: node.config.binding ?? "n/a",
							description: node.config.directory,
						});
						break;
					}
					case "ai": {
						children.push({
							type: "resource",
							name: node.config.binding,
						});
						break;
					}
					case "analytics_engine_datasets": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.dataset,
							});
						}
						break;
					}
					case "durable_objects": {
						for (const item of node.config.bindings) {
							children.push({
								type: "resource",
								name: item.name,
								description: item.class_name,
							});
						}
						break;
					}
					case "browser": {
						children.push({
							type: "resource",
							name: node.config.binding,
						});
						break;
					}
					case "hyperdrive": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.id,
							});
						}
						break;
					}
					case "mtls_certificates": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.certificate_id,
							});
						}
						break;
					}
					case "services": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.service,
							});
						}
						break;
					}
					case "tail_consumers": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.service,
								description: item.environment,
							});
						}
						break;
					}
					case "vars": {
						for (const [name, value] of Object.entries(node.config)) {
							children.push({
								type: "resource",
								name,
								description: JSON.stringify(value),
							});
						}
						break;
					}
					case "vectorize": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.index_name,
							});
						}
						break;
					}
					case "version_metadata": {
						children.push({
							type: "resource",
							name: node.config.binding,
						});
						break;
					}
					case "workflows": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.class_name,
							});
						}
						break;
					}
					case "logfwdr": {
						for (const item of node.config.bindings ?? []) {
							children.push({
								type: "resource",
								name: item.name,
								description: item.destination,
							});
						}
						break;
					}
					case "pipelines": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.pipeline,
							});
						}
						break;
					}
					case "send_email": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.name,
								description: item.destination_address,
							});
						}
						break;
					}
					case "dispatch_namespaces": {
						for (const item of node.config) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.namespace,
							});
						}
						break;
					}
					case "queues": {
						for (const item of node.config.producers ?? []) {
							children.push({
								type: "resource",
								name: item.binding,
								description: item.queue,
							});
						}
						break;
					}
					case "unsafe": {
						for (const item of node.config.bindings ?? []) {
							children.push({
								type: "resource",
								name: item.name,
								description: item.type,
							});
						}
						break;
					}
					default: {
						throw new Error(`Unknown binding type: ${node}`);
					}
				}

				return children;
			}
			case "resource":
				return [];
		}
	}
}

// Copied from https://github.com/cloudflare/workers-sdk/blob/178fd0123d8d4baf9f395bd8aade2cf1dccb6aa8/packages/wrangler/src/utils/print-bindings.ts#L18-L46
// With `tail_consumers` added and legacy bindings removed (`data_blobs`, `text_blobs`, `wasm_modules`)
export const friendlyBindingNames: Record<BindingType, string> = {
	durable_objects: "Durable Objects",
	kv_namespaces: "KV Namespaces",
	send_email: "Send Email",
	queues: "Queues",
	d1_databases: "D1 Databases",
	vectorize: "Vectorize Indexes",
	hyperdrive: "Hyperdrive Configs",
	r2_buckets: "R2 Buckets",
	logfwdr: "logfwdr",
	services: "Services",
	analytics_engine_datasets: "Analytics Engine Datasets",
	browser: "Browser",
	ai: "AI",
	version_metadata: "Worker Version Metadata",
	unsafe: "Unsafe Metadata",
	vars: "Vars",
	dispatch_namespaces: "Dispatch Namespaces",
	mtls_certificates: "mTLS Certificates",
	workflows: "Workflows",
	pipelines: "Pipelines",
	assets: "Assets",
	tail_consumers: "Tail Consumers",
} as const;

// Check if the binding has any items
// This is used to filter out empty bindings
function hasBinding<Config extends Record<string, unknown> | Array<unknown>>(
	config: Config | undefined
): config is Config {
	if (!config) {
		return false;
	}

	if (Array.isArray(config)) {
		return config.length > 0;
	}

	return Object.keys(config).length > 0;
}

// Finds the first wrangler config file in the workspace and parse it
export async function getWranglerConfig(): Promise<Config | undefined> {
	const configUri = await getConfigUri();
	if (!configUri) {
		return;
	}
	const workspaceFolder = vscode.workspace.getWorkspaceFolder(configUri);

	if (!workspaceFolder) {
		return;
	}

	const wrangler = importWrangler(workspaceFolder.uri.fsPath);
	if (!wrangler) {
		return;
	} else {
		const { rawConfig } = wrangler.experimental_readRawConfig({
			config: configUri.fsPath,
		});
		return rawConfig;
	}
}

export async function getConfigUri(): Promise<vscode.Uri | undefined> {
	const [configUri] = await vscode.workspace.findFiles(
		"wrangler.{toml,jsonc,json}",
		null,
		1
	);
	return configUri;
}
