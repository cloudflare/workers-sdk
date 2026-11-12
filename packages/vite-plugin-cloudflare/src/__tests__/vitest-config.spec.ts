import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, describe, test } from "vitest";
import { createVitest } from "vitest/node";
import type { Vitest } from "vitest/node";

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "vitest-config");

describe("the plugin in a Vitest config", () => {
	const cwd = process.cwd();
	const roots: string[] = [];
	const instances: Vitest[] = [];

	afterEach(async () => {
		process.chdir(cwd);
		for (const instance of instances.splice(0)) {
			await instance.close();
		}
		for (const root of roots.splice(0)) {
			removeDirSync(root);
		}
	});

	/** A Worker that imports a CommonJS dependency, as React and much of its ecosystem are. */
	function createProject() {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		const root = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
		roots.push(root);

		fs.writeFileSync(
			path.join(root, "package.json"),
			JSON.stringify({ name: "vitest-config", private: true, type: "module" })
		);
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  worker: {",
				"    name: 'worker',",
				"    entrypoint: './src/index.ts',",
				"    compatibilityDate: '2024-12-30',",
				"  },",
				"});",
			].join("\n")
		);
		fs.mkdirSync(path.join(root, "src"));
		fs.writeFileSync(
			path.join(root, "src/index.ts"),
			[
				"import dependency from 'cjs-dependency';",
				"export default { fetch: () => new Response(dependency.value) };",
			].join("\n")
		);
		fs.writeFileSync(
			path.join(root, "src/index.test.ts"),
			[
				"import { test } from 'vitest';",
				"test('runs', ({ expect }) => expect(1).toBe(1));",
			].join("\n")
		);

		const dependencyDir = path.join(root, "node_modules", "cjs-dependency");
		fs.mkdirSync(dependencyDir, { recursive: true });
		fs.writeFileSync(
			path.join(dependencyDir, "package.json"),
			JSON.stringify({
				name: "cjs-dependency",
				version: "1.0.0",
				main: "index.js",
			})
		);
		fs.writeFileSync(
			path.join(dependencyDir, "index.js"),
			"module.exports = { value: 'ok' };"
		);

		return root;
	}

	// Reference: https://github.com/cloudflare/workers-sdk/issues/14869
	test("Vitest starts when the Worker imports a CommonJS dependency", async ({
		expect,
	}) => {
		const root = createProject();
		// Run Vitest from the project directory, as `vitest` is run from the command line.
		// Vitest leaves `root` out of the config it passes to plugins, so the plugin finds
		// `cloudflare.config.ts` in the current working directory.
		process.chdir(root);

		const start = createVitest(
			{ root, config: false, watch: false, run: true },
			{
				configFile: false,
				logLevel: "silent",
				plugins: [cloudflare({ inspectorPort: false, persistState: false })],
			}
		).then((instance) => {
			instances.push(instance);
			return instance;
		});

		// Fails with `ReferenceError: module is not defined`: Vitest replaces the Worker
		// environment's `optimizeDeps`, so the CommonJS dependency is not pre-bundled
		// before the Worker runs it.
		await expect(start).resolves.toBeDefined();
	});
});
