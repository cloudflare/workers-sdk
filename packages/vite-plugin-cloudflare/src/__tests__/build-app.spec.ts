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
