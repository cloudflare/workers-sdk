import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test } from "vitest";
import { resolvePluginConfig } from "../plugin-config";
import type { PluginConfig, WorkersResolvedConfig } from "../plugin-config";

const viteEnv = { mode: "development", command: "serve" as const };

// Create the temp directory inside the package so Node can resolve the
// workspace-linked `@cloudflare/config` import from the generated
// `worker.config.ts` (Node walks up the directory tree looking for
// `node_modules`).
const FIXTURES_ROOT = path.resolve(
	__dirname,
	"fixtures",
	"experimental-newconfig"
);

describe("resolvePluginConfig - experimental.newConfig", () => {
	let tempDir: string;

	beforeEach(() => {
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);
	});

	afterEach(() => {
		removeDirSync(tempDir);
	});

	function seedWorkerSource() {
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(
			path.join(tempDir, "src/index.ts"),
			"export default { fetch() { return new Response('ok'); } }"
		);
	}

	function writeWorkerConfig(body: string) {
		fs.writeFileSync(path.join(tempDir, "worker.config.ts"), body);
	}

	test("throws when worker.config.ts is missing", async ({ expect }) => {
		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
		};

		await expect(
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).rejects.toThrow(/no `worker\.config\.ts` was found/);
	});

	test("throws when configPath is combined with experimental.newConfig", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  name: 'w',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"});",
			].join("\n")
		);

		const pluginConfig: PluginConfig = {
			configPath: "wrangler.jsonc",
			experimental: { newConfig: true },
		};

		await expect(
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).rejects.toThrow(/`configPath` cannot be used together/);
	});

	test("throws when auxiliaryWorkers are combined with experimental.newConfig", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  name: 'w',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"});",
			].join("\n")
		);

		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
			auxiliaryWorkers: [{ configPath: "aux.jsonc" }],
		};

		await expect(
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).rejects.toThrow(/auxiliaryWorkers/);
	});

	test("loads a worker.config.ts and produces a worker resolved config", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  name: 'experimental-config-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"});",
			].join("\n")
		);

		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
		};

		const result = (await resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		)) as WorkersResolvedConfig;

		expect(result.type).toBe("workers");
		expect(result.experimental.newConfig).toBe(true);
		const worker = result.environmentNameToWorkerMap.get(
			"experimental_config_worker"
		);
		expect(worker).toBeDefined();
		expect(worker?.config.name).toBe("experimental-config-worker");
		expect(worker?.config.compatibility_date).toBe("2024-12-30");
		expect(worker?.config.main).toBe(path.join(tempDir, "src/index.ts"));
	});

	test("evaluates a function config and passes the Vite mode", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig((ctx) => ({",
				"  name: `worker-${ctx.mode}`,",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"}));",
			].join("\n")
		);

		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
		};

		const result = (await resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		)) as WorkersResolvedConfig;

		expect(result.type).toBe("workers");
		const worker = result.environmentNameToWorkerMap.get("worker_development");
		expect(worker).toBeDefined();
		expect(worker?.config.name).toBe("worker-development");
	});

	test("adds worker.config.ts to configPaths for watching", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  name: 'experimental-config-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"});",
			].join("\n")
		);

		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
		};

		const result = (await resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		)) as WorkersResolvedConfig;

		const configPaths = Array.from(result.configPaths);
		expect(configPaths).toContain(path.join(tempDir, "worker.config.ts"));
		// Transitive `dependencies` from @cloudflare/config's loadConfig
		// (covered by its own unit tests) are also merged into configPaths.
	});
});
