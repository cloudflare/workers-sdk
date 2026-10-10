import assert from "node:assert";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createBuilder } from "vite";
import { onTestFinished, test } from "vitest";
import { cloudflare } from "../index";

test.for([
	{
		name: "default",
		upload: undefined,
		global: undefined,
		worker: undefined,
		expected: true,
	},
	{
		name: "upload opt-out",
		upload: false,
		global: undefined,
		worker: undefined,
		expected: false,
	},
	{
		name: "global opt-out",
		upload: undefined,
		global: false,
		worker: undefined,
		expected: false,
	},
	{
		name: "environment opt-out",
		upload: undefined,
		global: true,
		worker: false,
		expected: false,
	},
	{
		name: "environment opt-in",
		upload: undefined,
		global: false,
		worker: true,
		expected: true,
	},
	{
		name: "generation without uploads",
		upload: false,
		global: undefined,
		worker: true,
		expected: true,
	},
])(
	"builds usable Worker maps with $name",
	async ({ upload, global, worker, expected }, { expect }) => {
		const root = mkdtempSync(path.join(tmpdir(), "cloudflare-source-maps-"));
		onTestFinished(() => removeDirSync(root));
		mkdirSync(path.join(root, "src"));
		writeFileSync(
			path.join(root, "src/index.ts"),
			'export default { fetch() { throw new Error("original source"); } };'
		);

		const configPath = path.join(root, "wrangler.jsonc");
		writeFileSync(
			configPath,
			JSON.stringify({
				name: "test-worker",
				main: "src/index.ts",
				compatibility_date: "2024-12-30",
				upload_source_maps: upload,
			})
		);
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [
				cloudflare({ configPath, inspectorPort: false, persistState: false }),
			],
			build: { sourcemap: global },
			environments: { test_worker: { build: { sourcemap: worker } } },
		});
		await builder.buildApp();
		const outputDir = path.join(root, "dist/test_worker");
		const maps = readdirSync(outputDir).filter((file) => file.endsWith(".map"));
		expect(maps.length > 0).toBe(expected);
		if (expected) {
			const mapFile = maps[0];
			assert(mapFile);
			const map = JSON.parse(
				readFileSync(path.join(outputDir, mapFile), "utf8")
			);
			expect(
				map.sources.some((source: string) => source.endsWith("src/index.ts"))
			).toBe(true);
			expect(map.mappings.length).toBeGreaterThan(0);
		}
		const config = JSON.parse(
			readFileSync(path.join(outputDir, "wrangler.json"), "utf8")
		);
		expect(config.upload_source_maps).toBe(
			upload ?? (expected ? true : undefined)
		);
		assert(builder.environments.client);
		expect(builder.environments.client.config.build.sourcemap).toBe(
			global ?? false
		);
	}
);
