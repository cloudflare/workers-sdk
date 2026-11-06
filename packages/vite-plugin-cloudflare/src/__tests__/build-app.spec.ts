import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	getWorkerAssetsDir,
	getWorkerBundleDir,
	readBuildOutput,
} from "@cloudflare/build-output-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder } from "vite";
import { test } from "vitest";
import { cloudflare } from "../index";
import type { PluginConfig } from "../index";
import type { InlineConfig, ViteBuilder } from "vite";

runInTempDir();

function createFixture() {
	fs.writeFileSync(
		"cloudflare.config.ts",
		`export default { worker: {
			name: "build-app",
			entrypoint: "./worker.ts",
			compatibilityDate: "2024-12-30",
		} };`
	);
	fs.writeFileSync(
		"worker.ts",
		`import asset from "./worker-asset.txt?url";
		export default { fetch() { return new Response(asset); } };`
	);
	fs.writeFileSync("worker-asset.txt", "Asset imported by the Worker");
	fs.writeFileSync("index.html", "<h1>Client page</h1>");
}

async function buildFixture(
	options: {
		pluginConfig?: PluginConfig;
		viteConfig?: InlineConfig;
	} = {}
) {
	const builtEnvironments: string[] = [];
	// Match the CLI's automatic selection between legacy and environment builders.
	const builder = await createBuilder(
		{
			root: process.cwd(),
			configFile: false,
			logLevel: "silent",
			build: { assetsInlineLimit: 0 },
			...options.viteConfig,
			plugins: [
				cloudflare({
					types: { generate: false },
					...options.pluginConfig,
				}),
				{
					name: "record-environment-builds",
					buildStart() {
						builtEnvironments.push(this.environment.name);
					},
				},
				options.viteConfig?.plugins,
			],
		},
		null
	);
	await builder.buildApp();
	return { builder, builtEnvironments };
}

test.for([
	{ environments: [] },
	{ environments: ["client"] },
	{ environments: ["ssr"] },
	{ environments: ["client", "ssr"] },
])(
	"builds each environment once when another plugin builds %j first",
	async ({ environments }, { expect }) => {
		createFixture();
		const { builtEnvironments } = await buildFixture({
			pluginConfig: {
				auxiliaryWorkers: [
					{
						config: {
							name: "auxiliary",
							entrypoint: "./worker.ts",
							compatibilityDate: "2024-12-30",
						},
					},
					{
						config: {
							name: "dev-only",
							entrypoint: "./worker.ts",
							compatibilityDate: "2024-12-30",
						},
						devOnly: true,
					},
				],
			},
			viteConfig: {
				plugins: [
					{
						name: "framework-build",
						async buildApp(frameworkBuilder) {
							for (const name of environments) {
								const environment = frameworkBuilder.environments[name];
								assert(environment);
								await frameworkBuilder.build(environment);
							}
						},
					},
				],
			},
		});

		expect(builtEnvironments.sort()).toEqual(["auxiliary", "client", "ssr"]);
		const assetsDirectory = getWorkerAssetsDir(process.cwd());
		const assetFiles = fs.readdirSync(path.join(assetsDirectory, "assets"));
		expect(assetFiles).toHaveLength(1);
		const assetFile = assetFiles[0];
		assert(assetFile);
		expect(
			fs.readFileSync(path.join(assetsDirectory, "assets", assetFile), "utf8")
		).toBe("Asset imported by the Worker");
		expect(
			fs.readdirSync(path.join(getWorkerBundleDir(process.cwd()), "assets"))
		).toEqual([]);
	}
);

test.for([
	{ environments: ["ssr"], expectedBuilds: ["ssr", "client"] },
	{ environments: ["client", "ssr"], expectedBuilds: ["client", "ssr"] },
])(
	"completes client output after custom builder.buildApp builds %j and deletes the manifest",
	async ({ environments, expectedBuilds }, { expect }) => {
		createFixture();
		async function customBuildApp(builder: ViteBuilder) {
			for (const name of environments) {
				const environment = builder.environments[name];
				assert(environment);
				await builder.build(environment);
			}
			fs.unlinkSync(
				path.join(getWorkerBundleDir(process.cwd()), ".vite/manifest.json")
			);
		}
		const { builder, builtEnvironments } = await buildFixture({
			viteConfig: { builder: { buildApp: customBuildApp } },
		});
		expect(builder.config.builder?.buildApp).toBe(customBuildApp);
		expect(builtEnvironments).toEqual(expectedBuilds);
		expect(
			fs.readdirSync(path.join(getWorkerAssetsDir(process.cwd()), "assets"))
		).toHaveLength(1);
		expect(
			fs.readdirSync(path.join(getWorkerBundleDir(process.cwd()), "assets"))
		).toEqual([]);
		expect(
			(await readBuildOutput(process.cwd())).workers.default.bundleDir
		).toBe(getWorkerBundleDir(process.cwd()));
	}
);

test("does not build a fallback client for an entry Worker marked assets-only after a custom build", async ({
	expect,
}) => {
	createFixture();
	fs.unlinkSync("index.html");
	let assetsOnly = false;
	const { builder, builtEnvironments } = await buildFixture({
		pluginConfig: { assetsOnly: () => assetsOnly },
		viteConfig: {
			builder: {
				async buildApp(customBuilder) {
					const environment = customBuilder.environments.ssr;
					assert(environment);
					await customBuilder.build(environment);
					assetsOnly = true;
				},
			},
		},
	});
	expect(builtEnvironments).toEqual(["ssr"]);
	expect(builder.environments.client?.isBuilt).toBe(false);
	expect(
		fs.readdirSync(path.join(getWorkerBundleDir(process.cwd()), "assets"))
	).toHaveLength(1);
});

test.for([
	{ type: "worker", prebuilt: false },
	{ type: "assets-only", prebuilt: false },
	{ type: "dev-only-worker", prebuilt: false },
	{ type: "worker", prebuilt: true },
	{ type: "assets-only", prebuilt: true },
])(
	"moves prerender assets into the client output for %j",
	async ({ type, prebuilt }, { expect }) => {
		createFixture();
		if (type === "assets-only") {
			fs.writeFileSync(
				"cloudflare.config.ts",
				`export default { worker: { name: "build-app", compatibilityDate: "2024-12-30" } };`
			);
		}
		if (!prebuilt) {
			fs.unlinkSync("index.html");
		}
		fs.writeFileSync("prerender-asset.txt", "Asset imported only by prerender");
		fs.writeFileSync(
			"prerender.ts",
			`import sharedAsset from "./worker-asset.txt?url";
			import prerenderAsset from "./prerender-asset.txt?url";
			export default { fetch() { return new Response(sharedAsset + prerenderAsset); } };`
		);
		const prerenderBundleDir = getWorkerBundleDir(process.cwd(), "prerender");
		const { builtEnvironments } = await buildFixture({
			pluginConfig: {
				assetsOnly: type === "dev-only-worker",
				prerenderWorker: {
					config: {
						name: "prerender",
						entrypoint: "./prerender.ts",
						compatibilityDate: "2024-12-30",
					},
					viteEnvironment: { name: "render" },
				},
			},
			viteConfig: {
				plugins: [
					{
						name: "framework-build",
						async buildApp(builder) {
							if (!prebuilt) {
								return;
							}
							for (const name of ["client", "render"]) {
								const environment = builder.environments[name];
								assert(environment);
								await builder.build(environment);
							}
							fs.unlinkSync(
								path.join(prerenderBundleDir, ".vite/manifest.json")
							);
						},
					},
				],
			},
		});
		expect(builtEnvironments.sort()).toEqual(
			type === "worker" ? ["client", "render", "ssr"] : ["client", "render"]
		);
		const clientAssetsDir = path.join(
			getWorkerAssetsDir(process.cwd()),
			"assets"
		);
		expect(
			fs
				.readdirSync(clientAssetsDir)
				.map((file) =>
					fs.readFileSync(path.join(clientAssetsDir, file), "utf8")
				)
				.sort()
		).toEqual([
			"Asset imported by the Worker",
			"Asset imported only by prerender",
		]);
		expect(fs.readdirSync(path.join(prerenderBundleDir, "assets"))).toEqual([]);
		if (type === "worker") {
			expect(
				fs.readdirSync(path.join(getWorkerBundleDir(process.cwd()), "assets"))
			).toEqual([]);
		}
	}
);

test.for([
	{
		parent: "entry",
		assetsOnly: false,
		buildChild: true,
		expectedBuilds: ["child", "client", "ssr"],
	},
	{
		parent: "prerender",
		assetsOnly: false,
		buildChild: true,
		expectedBuilds: ["child", "client", "render", "ssr"],
	},
	{
		parent: "prerender",
		assetsOnly: true,
		buildChild: true,
		expectedBuilds: ["child", "client", "render"],
	},
	{
		parent: "entry",
		assetsOnly: true,
		buildChild: true,
		expectedBuilds: ["child", "ssr"],
	},
	{
		parent: "entry",
		assetsOnly: false,
		buildChild: false,
		expectedBuilds: ["ssr"],
	},
])(
	"handles child environment assets for %j",
	async ({ parent, assetsOnly, buildChild, expectedBuilds }, { expect }) => {
		createFixture();
		fs.unlinkSync("index.html");
		fs.writeFileSync(
			"worker.ts",
			`export default { fetch() { return new Response("Worker"); } };`
		);
		fs.writeFileSync("child-asset.txt", "Asset imported only by the child");
		fs.writeFileSync(
			"child.ts",
			`import asset from "./child-asset.txt?url"; export default asset;`
		);
		const parentName = parent === "entry" ? "ssr" : "render";
		const { builder, builtEnvironments } = await buildFixture({
			pluginConfig: {
				assetsOnly,
				viteEnvironment:
					parent === "entry" ? { childEnvironments: ["child"] } : undefined,
				prerenderWorker:
					parent === "prerender"
						? {
								config: {
									name: "prerender",
									entrypoint: "./worker.ts",
									compatibilityDate: "2024-12-30",
								},
								viteEnvironment: {
									name: "render",
									childEnvironments: ["child"],
								},
							}
						: undefined,
			},
			viteConfig: {
				environments: {
					child: {
						build: {
							rollupOptions: { input: path.resolve("child.ts") },
						},
					},
				},
				builder: {
					async buildApp(customBuilder) {
						const parentEnvironment = customBuilder.environments[parentName];
						assert(parentEnvironment);
						await customBuilder.build(parentEnvironment);
						if (buildChild) {
							const childEnvironment = customBuilder.environments.child;
							assert(childEnvironment);
							await customBuilder.build(childEnvironment);
						}
					},
				},
			},
		});
		expect(builtEnvironments.sort()).toEqual(expectedBuilds);
		const childEnvironment = builder.environments.child;
		assert(childEnvironment);
		expect(childEnvironment.isBuilt).toBe(buildChild);
		if (!buildChild) {
			return;
		}
		const childAssetsDir = path.join(
			childEnvironment.config.build.outDir,
			"assets"
		);
		if (!expectedBuilds.includes("client")) {
			expect(fs.readdirSync(childAssetsDir)).toHaveLength(1);
			return;
		}
		expect(fs.readdirSync(childAssetsDir)).toEqual([]);
		const clientAssetsDir = path.join(
			getWorkerAssetsDir(process.cwd()),
			"assets"
		);
		expect(
			fs
				.readdirSync(clientAssetsDir)
				.map((file) =>
					fs.readFileSync(path.join(clientAssetsDir, file), "utf8")
				)
		).toEqual(["Asset imported only by the child"]);
	}
);

test.for(["imported", "public", "none"])(
	"builds a fallback client only when needed with %s assets and no index.html",
	async (assets, { expect }) => {
		createFixture();
		fs.unlinkSync("index.html");
		if (assets !== "imported") {
			fs.writeFileSync(
				"worker.ts",
				`export default { fetch() { return new Response("Worker"); } };`
			);
		}
		if (assets === "public") {
			fs.mkdirSync("public");
			fs.writeFileSync("public/public-asset.txt", "Public asset");
		}
		const { builtEnvironments } = await buildFixture();
		expect(builtEnvironments).toEqual(
			assets === "none" ? ["ssr"] : ["ssr", "client"]
		);
		if (assets !== "none") {
			expect(fs.readdirSync(getWorkerAssetsDir(process.cwd()))).toEqual(
				assets === "imported" ? ["assets"] : ["public-asset.txt"]
			);
		}
	}
);

test.for(["assets-only", "dev-only-worker"])(
	"builds only the client for an %s application",
	async (type, { expect }) => {
		createFixture();
		if (type === "assets-only") {
			fs.writeFileSync(
				"cloudflare.config.ts",
				`export default { worker: { name: "build-app", compatibilityDate: "2024-12-30" } };`
			);
		}
		const { builtEnvironments } = await buildFixture({
			pluginConfig: { assetsOnly: type === "dev-only-worker" },
		});
		expect(builtEnvironments).toEqual(["client"]);
		expect(
			(await readBuildOutput(process.cwd())).workers.default.bundleDir
		).toBeUndefined();
	}
);
