import assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { Result } from "../../extension";

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
		it("shows no bindings if there is no wrangler config", async () => {
			const extension = getExtension();
			const { bindingsProvider } = await extension.activate();

			const children = await bindingsProvider.getChildren();

			assert.deepEqual(children, []);
		});

		it("lists bindings based on the wrangler config", async () => {
			const config = {
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
				d1_databases: [
					{
						binding: "db",
						database_id: "xxxxyyyyzzzzz",
					},
				],
			};
			const cleanup = await seed({
				"wrangler.json": JSON.stringify(config),
			});

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				const children = await bindingsProvider.getChildren();

				assert.deepEqual(children, [
					{
						type: "binding",
						config,
						env: null,
						binding: "KV Namespaces",
					},
					{
						type: "binding",
						config,
						env: null,
						binding: "R2 Buckets",
					},
					{
						type: "binding",
						config,
						env: null,
						binding: "D1 Databases",
					},
				]);

				const [kv, r2, d1] = children;

				assert.deepEqual(await bindingsProvider.getChildren(kv), [
					{
						type: "resource",
						config,
						env: null,
						binding: "KV Namespaces",
						name: "cache",
						description: "xx-yyyy-zzz",
					},
				]);
				assert.deepEqual(await bindingsProvider.getChildren(r2), [
					{
						type: "resource",
						config,
						env: null,
						binding: "R2 Buckets",
						name: "images",
						description: "something",
					},
				]);
				assert.deepEqual(await bindingsProvider.getChildren(d1), [
					{
						type: "resource",
						config,
						env: null,
						binding: "D1 Databases",
						name: "db",
						description: "xxxxyyyyzzzzz",
					},
				]);
			} finally {
				await cleanup();
			}
		});

		it("groups bindings by environment if available", async () => {
			const config = {
				name: "test",
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
			};
			const cleanup = await seed({
				"wrangler.json": JSON.stringify(config),
			});

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				const children = await bindingsProvider.getChildren();

				assert.deepEqual(children, [
					{
						type: "env",
						config,
						env: null,
					},
					{
						type: "env",
						config,
						env: "staging",
					},
					{
						type: "env",
						config,
						env: "production",
					},
				]);

				const [topLevelEnv, staging, production] = children;

				assert.deepEqual(await bindingsProvider.getChildren(topLevelEnv), [
					{
						type: "binding",
						config,
						env: null,
						binding: "D1 Databases",
					},
				]);

				assert.deepEqual(await bindingsProvider.getChildren(staging), [
					{
						type: "binding",
						config,
						env: "staging",
						binding: "KV Namespaces",
					},
				]);

				assert.deepEqual(await bindingsProvider.getChildren(production), [
					{
						type: "binding",
						config,
						env: "production",
						binding: "R2 Buckets",
					},
				]);
			} finally {
				await cleanup();
			}
		});

		it("hides top level env if there is no bindings", async () => {
			const config = {
				name: "test",
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
			};
			const cleanup = await seed({
				"wrangler.json": JSON.stringify(config),
			});

			try {
				const extension = getExtension();
				const { bindingsProvider } = await extension.activate();

				const children = await bindingsProvider.getChildren();

				assert.deepEqual(children, [
					{
						type: "env",
						config,
						env: "production",
					},
				]);
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
							"wrangler.json": JSON.stringify({
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
							"wrangler.json": JSON.stringify({
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
