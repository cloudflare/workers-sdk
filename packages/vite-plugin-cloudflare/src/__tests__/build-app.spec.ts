import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder } from "vite";
import { test } from "vitest";
import { cloudflare } from "../index";
import type { ViteBuilder } from "vite";

runInTempDir();

function createFixture() {
	fs.writeFileSync(
		"wrangler.json",
		JSON.stringify({
			name: "build-app",
			main: "worker.ts",
			compatibility_date: "2026-11-01",
		})
	);
	fs.writeFileSync(
		"worker.ts",
		'import asset from "./asset.txt?url"; export default { fetch() { return new Response(asset); } };'
	);
	fs.writeFileSync("asset.txt", "Worker asset");
	fs.writeFileSync("index.html", "<h1>Client</h1>");
}

test.for([false, true])(
	"completes assets after an earlier framework build (custom callback: %s)",
	async (custom, { expect }) => {
		createFixture();
		const built: string[] = [];
		async function buildWorker(builder: ViteBuilder) {
			const worker = builder.environments.ssr;
			assert(worker);
			await builder.build(worker);
			removeDirSync("dist/ssr/.vite");
		}
		const builder = await createBuilder({
			root: process.cwd(),
			configFile: false,
			logLevel: "silent",
			build: { assetsInlineLimit: 0 },
			builder: custom ? { buildApp: buildWorker } : {},
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					viteEnvironment: { name: "ssr" },
				}),
				{
					name: "framework",
					buildStart() {
						built.push(this.environment.name);
					},
					buildApp: custom ? undefined : buildWorker,
				},
			],
		});
		await builder.buildApp();
		expect(built.sort()).toEqual(["client", "ssr"]);
		const assets = fs.readdirSync("dist/client/assets");
		expect(assets).toHaveLength(1);
		assert(assets[0]);
		expect(
			fs.readFileSync(path.join("dist/client/assets", assets[0]), "utf8")
		).toBe("Worker asset");
		expect(fs.readdirSync("dist/ssr/assets")).toEqual([]);
		expect(fs.existsSync("dist/ssr/wrangler.json")).toBe(true);
	}
);

test("copies prerender imports to client assets while preserving prerender output", async ({
	expect,
}) => {
	createFixture();
	const builder = await createBuilder({
		root: process.cwd(),
		configFile: false,
		logLevel: "silent",
		build: { assetsInlineLimit: 0 },
		plugins: [
			cloudflare({
				inspectorPort: false,
				persistState: false,
				experimental: {
					prerenderWorker: {
						config: () => ({
							name: "prerender",
							main: "worker.ts",
							compatibility_date: "2026-11-01",
						}),
					},
				},
			}),
		],
	});
	await builder.buildApp();
	const prerender = builder.environments.prerender;
	assert(prerender);
	const assetsDir = path.join(prerender.config.build.outDir, "assets");
	const assets = fs.readdirSync(assetsDir);
	expect(assets).toHaveLength(1);
	assert(assets[0]);
	expect(fs.readFileSync(path.join(assetsDir, assets[0]), "utf8")).toBe(
		"Worker asset"
	);
	expect(
		fs.readFileSync(path.join("dist/client/assets", assets[0]), "utf8")
	).toBe("Worker asset");
});
