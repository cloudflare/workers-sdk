import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePluginConfig } from "../plugin-config";
import type { PluginConfig, WorkersResolvedConfig } from "../plugin-config";

describe("resolvePluginConfig - auxiliary workers", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	const viteEnv = { mode: "development", command: "serve" as const };

	function createEntryWorkerConfig(dir: string) {
		const configPath = path.join(dir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name: "entry-worker",
				main: "./src/index.ts",
				compatibility_date: "2024-01-01",
			})
		);
		// Create the main file so validation passes
		fs.mkdirSync(path.join(dir, "src"), { recursive: true });
		fs.writeFileSync(path.join(dir, "src/index.ts"), "export default {}");
		return configPath;
	}

	test("should resolve auxiliary worker from config file", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);

		// Create auxiliary worker config
		const auxDir = path.join(tempDir, "aux");
		fs.mkdirSync(auxDir, { recursive: true });
		const auxConfigPath = path.join(auxDir, "wrangler.jsonc");
		fs.writeFileSync(
			auxConfigPath,
			JSON.stringify({
				name: "aux-worker",
				main: "./worker.ts",
				compatibility_date: "2024-01-01",
			})
		);
		fs.writeFileSync(path.join(auxDir, "worker.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [{ configPath: auxConfigPath }],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("workers");
		const workersResult = result as WorkersResolvedConfig;
		expect(workersResult.rawConfigs.auxiliaryWorkers).toHaveLength(1);
		expect(workersResult.rawConfigs.auxiliaryWorkers[0]?.config.name).toBe(
			"aux-worker"
		);
	});

	test("should resolve inline auxiliary worker with configure object", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					configure: {
						name: "inline-aux-worker",
						main: "./src/aux.ts",
					},
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("workers");
		const workersResult = result as WorkersResolvedConfig;
		expect(workersResult.rawConfigs.auxiliaryWorkers).toHaveLength(1);
		expect(workersResult.rawConfigs.auxiliaryWorkers[0]?.config.name).toBe(
			"inline-aux-worker"
		);
		expect(workersResult.rawConfigs.auxiliaryWorkers[0]?.config.main).toBe(
			"./src/aux.ts"
		);
	});

	test("should resolve inline auxiliary worker with configure function", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					configure: () => ({
						name: "fn-aux-worker",
						main: "./src/fn-aux.ts",
					}),
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("workers");
		const workersResult = result as WorkersResolvedConfig;
		expect(workersResult.rawConfigs.auxiliaryWorkers[0]?.config.name).toBe(
			"fn-aux-worker"
		);
	});

	test("should auto-populate topLevelName from name if not set", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					configure: {
						name: "my-aux-worker",
						main: "./src/aux.ts",
					},
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("workers");
		const workersResult = result as WorkersResolvedConfig;
		expect(workersResult.rawConfigs.auxiliaryWorkers[0]?.config.name).toBe(
			"my-aux-worker"
		);
		expect(
			workersResult.rawConfigs.auxiliaryWorkers[0]?.config.topLevelName
		).toBe("my-aux-worker");
	});

	test("should apply configure to file-based auxiliary worker", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);

		// Create auxiliary worker config with initial values
		const auxDir = path.join(tempDir, "aux");
		fs.mkdirSync(auxDir, { recursive: true });
		const auxConfigPath = path.join(auxDir, "wrangler.jsonc");
		fs.writeFileSync(
			auxConfigPath,
			JSON.stringify({
				name: "aux-worker",
				main: "./worker.ts",
				compatibility_date: "2024-01-01",
			})
		);
		fs.writeFileSync(path.join(auxDir, "worker.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					configPath: auxConfigPath,
					configure: {
						compatibility_date: "2025-01-01",
					},
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("workers");
		const workersResult = result as WorkersResolvedConfig;
		// The configure should override the file's compatibility_date
		expect(
			workersResult.rawConfigs.auxiliaryWorkers[0]?.config.compatibility_date
		).toBe("2025-01-01");
		// But preserve the name from file
		expect(workersResult.rawConfigs.auxiliaryWorkers[0]?.config.name).toBe(
			"aux-worker"
		);
	});

	test("should throw if inline auxiliary worker is missing required fields", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					configure: {
						// Missing name and main
					},
				},
			],
		};

		expect(() =>
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).toThrow();
	});
});
