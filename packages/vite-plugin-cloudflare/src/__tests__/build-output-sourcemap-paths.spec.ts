import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { createBuilder } from "vite";
import { afterEach, beforeEach, test } from "vitest";
import { cloudflare } from "../index";

const FIXTURES_ROOT = path.resolve(
	__dirname,
	"fixtures",
	"build-output-sourcemap-paths"
);

let root: string;

beforeEach(() => {
	fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
	root = fs.realpathSync(fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-")));

	fs.mkdirSync(path.join(root, "src"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "src/index.ts"),
		[
			"import { explode } from 'fake-dep';",
			"",
			"export default {",
			"	async fetch() {",
			"		return new Response(explode());",
			"	},",
			"};",
		].join("\n")
	);
	fs.writeFileSync(
		path.join(root, "cloudflare.config.ts"),
		[
			"import { defineConfig } from '@cloudflare/config';",
			"export default defineConfig({",
			"  worker: {",
			"    name: 'entry-worker',",
			"    entrypoint: './src/index.ts',",
			"    compatibilityDate: '2024-12-30',",
			"  },",
			"});",
		].join("\n")
	);

	// A bundled dependency, so the Worker's sources include `node_modules`
	// paths outside its own entrypoint directory, as real projects do.
	fs.mkdirSync(path.join(root, "node_modules", "fake-dep"), {
		recursive: true,
	});
	fs.writeFileSync(
		path.join(root, "node_modules", "fake-dep", "package.json"),
		JSON.stringify({
			name: "fake-dep",
			version: "1.0.0",
			type: "module",
			main: "index.mjs",
		})
	);
	fs.writeFileSync(
		path.join(root, "node_modules", "fake-dep", "index.mjs"),
		"export const explode = () => 'boom';\n"
	);
});

afterEach(() => removeDirSync(root));

/**
 * Reads the source map emitted next to the Worker's main module.
 *
 * Mirrors the deploy path, which resolves the map through the main module's
 * `sourceMappingURL` comment and uploads its `sources` as-is. The Workers
 * runtime prints those `sources` in remapped stack traces, so they should
 * name files as the project sees them, not as the bundle's output directory
 * does.
 */
async function readWorkerSourceMap(): Promise<{ sources: string[] }> {
	const workerDir = path.join(
		root,
		".cloudflare/output/v0/workers/default"
	);
	const workerConfig = JSON.parse(
		fs.readFileSync(path.join(workerDir, "worker.config.json"), "utf8")
	) as { manifest: { mainModule: string } };

	const sourceMapPath = path.join(
		workerDir,
		"bundle",
		`${workerConfig.manifest.mainModule}.map`
	);
	return JSON.parse(fs.readFileSync(sourceMapPath, "utf8")) as {
		sources: string[];
	};
}

test("emits project-relative sources in the Worker's source map", async ({
	expect,
}) => {
	const builder = await createBuilder({
		root,
		logLevel: "silent",
		plugins: [cloudflare({ inspectorPort: false, persistState: false })],
	});
	await builder.buildApp();

	const { sources } = await readWorkerSourceMap();

	expect(sources).toContain("src/index.ts");
	expect(sources).toContain("node_modules/fake-dep/index.mjs");
	for (const source of sources) {
		expect(source.startsWith("../")).toBe(false);
	}
});
