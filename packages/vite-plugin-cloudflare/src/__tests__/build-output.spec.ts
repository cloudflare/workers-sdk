import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { getWorkerAssetsDir } from "@cloudflare/build-output-utils";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { createBuilder } from "vite";
import { describe, it } from "vitest";
import { cloudflare } from "../index";
import { detectModuleType } from "../plugins/build-output";

describe("detectModuleType", () => {
	const cases: Array<{ filename: string; expected: string }> = [
		{ filename: "entry.js", expected: "esm" },
		{ filename: "entry.mjs", expected: "esm" },
		{ filename: "lib.wasm", expected: "wasm" },
		{ filename: "raw.bin", expected: "data" },
		{ filename: "greeting.txt", expected: "text" },
		{ filename: "page.html", expected: "text" },
		{ filename: "query.sql", expected: "text" },
		{ filename: "data.json", expected: "json" },
		{ filename: "bundle.js.map", expected: "sourcemap" },
		{ filename: "unknown.xyz", expected: "data" },
		// Case-insensitive on extension
		{ filename: "ENTRY.JS", expected: "esm" },
		{ filename: "LIB.WASM", expected: "wasm" },
		// No extension → default `data`
		{ filename: "LICENSE", expected: "data" },
		// Nested paths — only the extension matters
		{ filename: "chunks/foo.js", expected: "esm" },
		{ filename: "chunks/foo.wasm", expected: "wasm" },
	];

	it.for(cases)(
		"maps $filename → $expected",
		({ filename, expected }, { expect }) => {
			expect(detectModuleType(filename)).toBe(expected);
		}
	);
});

describe("root public directory", () => {
	runInTempDir();

	it("preserves generated output without copying it into itself", async ({
		expect,
	}) => {
		await seed({
			"cloudflare.config.ts": `export default {
				type: "worker",
				name: "root-public-build",
				compatibilityDate: "2024-12-30",
				assets: {},
			};`,
			"index.html":
				'<h1>static</h1><script type="module" src="/src/client.ts"></script>',
			"src/client.ts": 'document.querySelector("h1")?.remove();',
		});

		const root = process.cwd();
		const builder = await createBuilder({
			root,
			publicDir: ".",
			logLevel: "silent",
			plugins: [
				cloudflare({
					experimental: {
						newConfig: {
							cfBuildOutput: true,
							types: { generate: false },
						},
					},
				}),
			],
		});

		await builder.buildApp();

		const assetsDir = getWorkerAssetsDir(root);
		expect(fs.readFileSync(path.join(assetsDir, "index.html"), "utf8")).toMatch(
			/<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/
		);
		expect(fs.existsSync(path.join(assetsDir, ".cloudflare"))).toBe(false);
	});

	it("copies root assets with a custom app builder", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default {
				type: "worker",
				name: "root-public-custom-build",
				compatibilityDate: "2024-12-30",
				assets: {},
			};`,
			"index.html": "<h1>static</h1>",
			"public.txt": "public asset",
		});

		const root = process.cwd();
		const builder = await createBuilder({
			root,
			publicDir: ".",
			logLevel: "silent",
			builder: {
				async buildApp(viteBuilder) {
					const clientEnvironment = viteBuilder.environments.client;
					assert(clientEnvironment, 'No "client" environment');
					await viteBuilder.build(clientEnvironment);
				},
			},
			plugins: [
				cloudflare({
					experimental: {
						newConfig: {
							cfBuildOutput: true,
							types: { generate: false },
						},
					},
				}),
			],
		});

		await builder.buildApp();

		expect(
			fs.readFileSync(path.join(getWorkerAssetsDir(root), "public.txt"), "utf8")
		).toBe("public asset");
	});
});
