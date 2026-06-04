import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test } from "vitest";
import { resolvePluginConfig } from "../plugin-config";
import type { PluginConfig, WorkersResolvedConfig } from "../plugin-config";

const viteEnv = { mode: "development", command: "serve" as const };

// Create the temp directory inside the package so Node can resolve the
// workspace-linked `@cloudflare/config` import from the generated
// `cloudflare.config.ts` (Node walks up the directory tree looking for
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
		fs.writeFileSync(path.join(tempDir, "cloudflare.config.ts"), body);
	}

	test("throws when cloudflare.config.ts is missing", async ({ expect }) => {
		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
		};

		await expect(
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).rejects.toThrow(/no `cloudflare\.config\.ts` was found/);
	});

	test("throws when configPath is combined with experimental.newConfig", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
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
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
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

	test("loads a cloudflare.config.ts and produces a worker resolved config", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
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
		expect(result.experimental.newConfig).toEqual({
			types: { generate: true },
		});
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
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker((ctx) => ({",
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

	test("adds cloudflare.config.ts to configPaths for watching", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
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
		expect(configPaths).toContain(path.join(tempDir, "cloudflare.config.ts"));
		// Transitive `dependencies` from @cloudflare/config's loadConfig
		// (covered by its own unit tests) are also merged into configPaths.
	});

	test("writes worker-configuration.d.ts pointing at the vite-plugin subpath", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
				"  name: 'experimental-config-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"});",
			].join("\n")
		);

		await resolvePluginConfig(
			{ experimental: { newConfig: true } },
			{ root: tempDir },
			viteEnv
		);

		const dtsPath = path.join(tempDir, "worker-configuration.d.ts");
		expect(fs.existsSync(dtsPath)).toBe(true);
		const content = fs.readFileSync(dtsPath, "utf8");
		expect(content).toContain(
			`from "@cloudflare/vite-plugin/experimental-config"`
		);
		expect(content).toContain(`import type Config from "./cloudflare.config"`);
		expect(content).not.toContain(`} from "@cloudflare/config"`);
	});

	test("does not write the .d.ts when types.generate is false", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
				"  name: 'experimental-config-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"});",
			].join("\n")
		);

		await resolvePluginConfig(
			{ experimental: { newConfig: { types: { generate: false } } } },
			{ root: tempDir },
			viteEnv
		);

		const dtsPath = path.join(tempDir, "worker-configuration.d.ts");
		expect(fs.existsSync(dtsPath)).toBe(false);
	});

	test.for([
		{ mode: "development", command: "serve" as const },
		{ mode: "production", command: "build" as const },
	])("throws on durable-object exports ($command)", async (env, { expect }) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
				"  name: 'experimental-config-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"  exports: {",
				"    Counter: { type: 'durable-object', storage: 'sqlite' },",
				"  },",
				"});",
			].join("\n")
		);

		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
		};

		await expect(
			resolvePluginConfig(pluginConfig, { root: tempDir }, env)
		).rejects.toThrow(/Durable Object exports/);
	});

	test("does not rewrite worker-configuration.d.ts when content is unchanged", async ({
		expect,
	}) => {
		seedWorkerSource();
		writeWorkerConfig(
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
				"  name: 'experimental-config-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"});",
			].join("\n")
		);
		const pluginConfig: PluginConfig = {
			experimental: { newConfig: true },
		};

		await resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv);
		const dtsPath = path.join(tempDir, "worker-configuration.d.ts");
		const firstMtime = fs.statSync(dtsPath).mtimeMs;

		// Ensure mtime resolution boundary is crossed before the second run.
		await new Promise((r) => setTimeout(r, 25));

		await resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv);
		const secondMtime = fs.statSync(dtsPath).mtimeMs;

		expect(secondMtime).toBe(firstMtime);
	});
});
