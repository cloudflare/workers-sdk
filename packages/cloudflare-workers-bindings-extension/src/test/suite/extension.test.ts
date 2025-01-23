import assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { friendlyBindingNames } from "../../show-bindings";
import type { Result } from "../../extension";
import type { BindingType, Config } from "../../show-bindings";

// Environment variable set by the test runner (See packages/cloudflare-workers-bindings-extension/src/test/runTest.ts)
assert(
	process.env.VSCODE_WORKSPACE_PATH,
	"process.env.VSCODE_WORKSPACE_PATH is not available"
);

describe("Extension Test Suite", () => {
	before(async () => {
		await symlinkWranglerNodeModule();
	});

	describe("BindingsProvider", () => {
		it("should not return wrangler if the version of wrangler is too old", async () => {
			const pkgJsonPath = path
				.resolve(__dirname, "..", "..", "..", "..", "wrangler", "package.json")
				.toString();

			const originalPkgJson = JSON.parse(
				await fs.readFile(pkgJsonPath, "utf8")
			);

			const cleanup = await seed({
				"wrangler.json": generateWranglerConfig({
					r2_buckets: [
						{
							binding: "r2",
							bucket_name: "something else",
						},
					],
				}),
			});

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				await fs.writeFile(
					pkgJsonPath,
					JSON.stringify({ ...originalPkgJson, version: "3.98.0" })
				);
				// bindingsProvider uses wrangler to read config.
				// If that doesn't work, but we have provided a wrangler.json,
				// this means wrangler wasn't imported. Which should be
				// because its an old version. (not the best test :/)
				let children = await bindingsProvider.getChildren();
				assert.deepEqual(children, []);

				await fs.writeFile(
					pkgJsonPath,
					JSON.stringify({ ...originalPkgJson, version: "3.99.0" })
				);
				children = await bindingsProvider.getChildren();
				assert.deepEqual(children, [
					{
						config: [
							{
								binding: "r2",
								bucket_name: "something else",
							},
						],
						name: "r2_buckets",
						type: "binding",
					},
				]);

				await fs.writeFile(
					pkgJsonPath,
					JSON.stringify({ ...originalPkgJson, version: "2.99.0" })
				);
				children = await bindingsProvider.getChildren();
				assert.deepEqual(children, []);

				// pre-releases should work
				await fs.writeFile(
					pkgJsonPath,
					JSON.stringify({ ...originalPkgJson, version: "0.0.0-something" })
				);
				children = await bindingsProvider.getChildren();
				assert.deepEqual(children, [
					{
						config: [
							{
								binding: "r2",
								bucket_name: "something else",
							},
						],
						name: "r2_buckets",
						type: "binding",
					},
				]);
			} finally {
				await cleanup();
				await fs.writeFile(
					pkgJsonPath,
					JSON.stringify(originalPkgJson, null, "\t") + "\n"
				);
			}
		});

		it("shows no bindings if there is no wrangler config", async () => {
			const extension = getExtension();
			const { bindingsProvider } = await extension.activate();

			const children = await bindingsProvider.getChildren();

			assert.deepEqual(children, []);
		});

		it("lists bindings based on the wrangler config", async () => {
			const cleanup = await seed({
				"wrangler.json": generateWranglerConfig({
					ai: {
						binding: "AI",
					},
					analytics_engine_datasets: [
						{
							binding: "ANALYTICS",
							dataset: "<dataset>",
						},
					],
					assets: {
						binding: "ASSETS",
						directory: "./public/",
					},
					browser: {
						binding: "MYBROWSER",
					},
					d1_databases: [
						{
							binding: "DB",
							database_id: "<YOUR_D1_DATABASE_ID>",
						},
					],
					dispatch_namespaces: [
						{
							binding: "DISPATCHER",
							namespace: "testing",
						},
					],
					durable_objects: {
						bindings: [
							{
								name: "MY_DURABLE_OBJECT",
								class_name: "MyDurableObject",
							},
						],
					},
					vars: {
						API_HOST: "example.com",
						API_ACCOUNT_ID: "example_user",
						SERVICE_X_DATA: {
							URL: "service-x-api.dev.example",
							MY_ID: 123,
						},
					},
					hyperdrive: [
						{
							binding: "HYPERDRIVE",
							id: "<YOUR_DATABASE_ID>",
						},
					],
					kv_namespaces: [
						{
							binding: "CACHE",
							id: "<YOUR_KV_NAMESPACE_ID>",
						},
					],
					mtls_certificates: [
						{
							binding: "MY_CERT",
							certificate_id: "<CERTIFICATE_ID>",
						},
					],
					queues: {
						producers: [
							{
								queue: "MY-QUEUE-NAME",
								binding: "MY_QUEUE",
							},
						],
					},
					r2_buckets: [
						{
							binding: "IMAGES",
							bucket_name: "<YOUR_BUCKET_NAME>",
						},
					],
					logfwdr: {
						bindings: [
							{
								name: "LOG",
								destination: "<YOUR_LOG_DESTINATION>",
							},
						],
					},
					pipelines: [
						{
							binding: "PIPELINE",
							pipeline: "<YOUR_PIPELINE>",
						},
					],
					send_email: [
						{
							name: "EMAIL",
							destination_address: "<YOUR_EMAIL_ADDRESS>",
						},
					],
					services: [
						{
							binding: "<BINDING_NAME>",
							service: "<WORKER_NAME>",
						},
					],
					vectorize: [
						{
							binding: "VECTORIZE",
							index_name: "embeddings-index",
						},
					],
					version_metadata: {
						binding: "CF_VERSION_METADATA",
					},
					workflows: [
						{
							name: "workflows-starter",
							binding: "MY_WORKFLOW",
							class_name: "MyWorkflow",
						},
					],
					unsafe: {
						bindings: [
							{
								name: "MY_RATE_LIMITER",
								type: "ratelimit",
								namespace_id: "1001",
								simple: {
									limit: 100,
									period: 60,
								},
							},
						],
					},
				}),
			});

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				const children = await bindingsProvider.getChildren();

				assert.deepEqual(
					children.map((child) => bindingsProvider.getTreeItem(child)),
					[
						{
							label: friendlyBindingNames.kv_namespaces,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							contextValue: "binding",
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/kv_namespaces.svg"
							),
						},
						{
							label: friendlyBindingNames.r2_buckets,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							contextValue: "binding",
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/r2_buckets.svg"
							),
						},
						{
							label: friendlyBindingNames.d1_databases,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							contextValue: "binding",
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/d1_databases.svg"
							),
						},
						{
							label: friendlyBindingNames.durable_objects,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/durable_objects.svg"
							),
						},
						{
							label: friendlyBindingNames.ai,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/ai.svg"
							),
						},
						{
							label: friendlyBindingNames.analytics_engine_datasets,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/analytics_engine_datasets.svg"
							),
						},
						{
							label: friendlyBindingNames.browser,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/browser.svg"
							),
						},
						{
							label: friendlyBindingNames.hyperdrive,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/hyperdrive.svg"
							),
						},
						{
							label: friendlyBindingNames.mtls_certificates,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/mtls_certificates.svg"
							),
						},
						{
							label: friendlyBindingNames.services,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/services.svg"
							),
						},
						{
							label: friendlyBindingNames.assets,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/assets.svg"
							),
						},
						{
							label: friendlyBindingNames.vectorize,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/vectorize.svg"
							),
						},
						{
							label: friendlyBindingNames.version_metadata,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/version_metadata.svg"
							),
						},
						{
							label: friendlyBindingNames.dispatch_namespaces,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/dispatch_namespaces.svg"
							),
						},
						{
							label: friendlyBindingNames.queues,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/queues.svg"
							),
						},
						{
							label: friendlyBindingNames.workflows,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/workflows.svg"
							),
						},
						{
							label: friendlyBindingNames.send_email,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/send_email.svg"
							),
						},
						{
							label: friendlyBindingNames.logfwdr,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/logfwdr.svg"
							),
						},
						{
							label: friendlyBindingNames.pipelines,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/pipelines.svg"
							),
						},
						{
							label: friendlyBindingNames.vars,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/vars.svg"
							),
						},
						{
							label: friendlyBindingNames.unsafe,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/unsafe.svg"
							),
						},
					]
				);

				async function getBindingChildren(binding: BindingType) {
					const bindingNode = children.find(
						(child) => child.type === "binding" && child.name === binding
					);

					if (!bindingNode) {
						return [];
					}

					const grandChildren = await bindingsProvider.getChildren(bindingNode);

					return grandChildren.map((child) =>
						bindingsProvider.getTreeItem(child)
					);
				}

				assert.deepEqual(await getBindingChildren("kv_namespaces"), [
					{
						label: "CACHE",
						description: "<YOUR_KV_NAMESPACE_ID>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("r2_buckets"), [
					{
						label: "IMAGES",
						description: "<YOUR_BUCKET_NAME>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("d1_databases"), [
					{
						label: "DB",
						description: "<YOUR_D1_DATABASE_ID>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("durable_objects"), [
					{
						label: "MY_DURABLE_OBJECT",
						description: "MyDurableObject",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("ai"), [
					{
						label: "AI",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(
					await getBindingChildren("analytics_engine_datasets"),
					[
						{
							label: "ANALYTICS",
							description: "<dataset>",
							collapsibleState: vscode.TreeItemCollapsibleState.None,
						},
					]
				);

				assert.deepEqual(await getBindingChildren("browser"), [
					{
						label: "MYBROWSER",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("hyperdrive"), [
					{
						label: "HYPERDRIVE",
						description: "<YOUR_DATABASE_ID>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("mtls_certificates"), [
					{
						label: "MY_CERT",
						description: "<CERTIFICATE_ID>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("services"), [
					{
						label: "<BINDING_NAME>",
						description: "<WORKER_NAME>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("assets"), [
					{
						label: "ASSETS",
						description: "./public/",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("vectorize"), [
					{
						label: "VECTORIZE",
						description: "embeddings-index",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("version_metadata"), [
					{
						label: "CF_VERSION_METADATA",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("dispatch_namespaces"), [
					{
						label: "DISPATCHER",
						description: "testing",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("queues"), [
					{
						label: "MY_QUEUE",
						description: "MY-QUEUE-NAME",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("workflows"), [
					{
						label: "MY_WORKFLOW",
						description: "MyWorkflow",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("send_email"), [
					{
						label: "EMAIL",
						description: "<YOUR_EMAIL_ADDRESS>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("logfwdr"), [
					{
						label: "LOG",
						description: "<YOUR_LOG_DESTINATION>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("pipelines"), [
					{
						label: "PIPELINE",
						description: "<YOUR_PIPELINE>",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("vars"), [
					{
						label: "API_HOST",
						description: JSON.stringify("example.com"),
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
					{
						label: "API_ACCOUNT_ID",
						description: JSON.stringify("example_user"),
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
					{
						label: "SERVICE_X_DATA",
						description: JSON.stringify({
							URL: "service-x-api.dev.example",
							MY_ID: 123,
						}),
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);

				assert.deepEqual(await getBindingChildren("unsafe"), [
					{
						label: "MY_RATE_LIMITER",
						description: "ratelimit",
						collapsibleState: vscode.TreeItemCollapsibleState.None,
					},
				]);
			} finally {
				await cleanup();
			}
		});

		it("groups bindings by environment if available", async () => {
			const cleanup = await seed({
				"wrangler.json": generateWranglerConfig({
					d1_databases: [
						{
							binding: "db",
							database_id: "xxxxyyyyzzzzz",
						},
					],
					env: {
						development: {},
						staging: {
							kv_namespaces: [
								{
									binding: "kv",
									id: "aa-bb-cc",
								},
							],
						},
						production: {
							r2_buckets: [
								{
									binding: "r2",
									bucket_name: "something else",
								},
							],
						},
					},
				}),
			});

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				const children = await bindingsProvider.getChildren();

				assert.deepEqual(
					children.map((child) => bindingsProvider.getTreeItem(child)),
					[
						{
							label: "Top-level env",
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
						},
						{
							label: "staging",
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
						},
						{
							label: "production",
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
						},
					]
				);

				const [topLevelEnv, staging, production] = children;

				const topLevelEnvChildren =
					await bindingsProvider.getChildren(topLevelEnv);
				assert.deepEqual(
					topLevelEnvChildren.map((child) =>
						bindingsProvider.getTreeItem(child)
					),
					[
						{
							label: friendlyBindingNames.d1_databases,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							contextValue: "binding",
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/d1_databases.svg"
							),
						},
					]
				);

				const stagingChildren = await bindingsProvider.getChildren(staging);
				assert.deepEqual(
					stagingChildren.map((child) => bindingsProvider.getTreeItem(child)),
					[
						{
							label: friendlyBindingNames.kv_namespaces,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							contextValue: "binding",
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/kv_namespaces.svg"
							),
						},
					]
				);

				const productionChildren =
					await bindingsProvider.getChildren(production);
				assert.deepEqual(
					productionChildren.map((child) =>
						bindingsProvider.getTreeItem(child)
					),
					[
						{
							label: friendlyBindingNames.r2_buckets,
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
							contextValue: "binding",
							iconPath: path.join(
								__filename,
								"../../../../resources/icons/r2_buckets.svg"
							),
						},
					]
				);
			} finally {
				await cleanup();
			}
		});

		it("hides top level env if there is no bindings", async () => {
			const cleanup = await seed({
				"wrangler.json": generateWranglerConfig({
					env: {
						production: {
							r2_buckets: [
								{
									binding: "r2",
									bucket_name: "something else",
								},
							],
						},
					},
				}),
			});

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				const children = await bindingsProvider.getChildren();

				assert.deepEqual(
					children.map((child) => bindingsProvider.getTreeItem(child)),
					[
						{
							label: "production",
							collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
						},
					]
				);
			} finally {
				await cleanup();
			}
		});

		it("watch for config file changes", async () => {
			const cleanups: Array<() => Promise<void>> = [];

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				await assert.doesNotReject(() =>
					Promise.all([
						// This should be resolved when the config file is created
						new Promise((resolve) => {
							bindingsProvider.onDidChangeTreeData(resolve);
						}),
						// Test creating config file
						seed({
							"wrangler.json": generateWranglerConfig({
								name: "test",
								kv_namespaces: [
									{
										binding: "cache",
										id: "xx-yyyy-zzz",
									},
								],
							}),
						}).then((cleanup) => {
							cleanups.push(cleanup);
						}),
					])
				);

				await assert.doesNotReject(() =>
					Promise.all([
						// This should be resolved when the config file changes
						new Promise((resolve) => {
							bindingsProvider.onDidChangeTreeData(resolve);
						}),
						// Test changing the config file
						seed({
							"wrangler.json": generateWranglerConfig({
								name: "test",
								kv_namespaces: [
									{
										binding: "cache",
										id: "xx-yyyy-zzz",
									},
								],
								r2_buckets: [
									{
										binding: "images",
										bucket_name: "something",
									},
								],
							}),
						}).then((cleanup) => {
							cleanups.push(cleanup);
						}),
					])
				);

				await assert.doesNotReject(() =>
					Promise.all([
						// This should be resolved when the config file is deleted
						new Promise((resolve) => {
							bindingsProvider.onDidChangeTreeData(resolve);
						}),
						// Test deleting the config file
						Promise.all(cleanups.map((cleanup) => cleanup())),
					])
				);
			} finally {
				await Promise.all(cleanups.map((cleanup) => cleanup()));
			}
		});
	});
});

function getExtension() {
	const extension = vscode.extensions.getExtension<Result>(
		"cloudflare.cloudflare-workers-bindings-extension"
	);

	if (!extension) {
		throw new Error("Extension not found");
	}

	return extension;
}

function generateWranglerConfig(config: Config) {
	return JSON.stringify(config);
}

async function symlinkWranglerNodeModule() {
	const nodeModulesPath = path.join(
		process.env.VSCODE_WORKSPACE_PATH ?? "",
		"node_modules"
	);
	const wranglerNodeModulePath = path.resolve(
		__dirname,
		"..",
		"..",
		"..",
		"..",
		"wrangler"
	);

	console.log("wranglerNodeModulePath", wranglerNodeModulePath);
	console.log("nodeModulesPath", nodeModulesPath);
	await fs.mkdir(nodeModulesPath, { recursive: true });
	await fs.symlink(
		wranglerNodeModulePath,
		path.join(nodeModulesPath, "wrangler"),
		"dir"
	);
}

async function seed(files: Record<string, string>) {
	const root = process.env.VSCODE_WORKSPACE_PATH ?? "";

	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, contents);
	}

	let cleanedUp = false;

	return async () => {
		if (cleanedUp) {
			return;
		}

		for (const name of Object.keys(files)) {
			const filePath = path.resolve(root, name);

			await fs.rm(filePath, { recursive: true });
		}

		cleanedUp = true;
	};
}
