import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePluginConfig } from "../plugin-config";
import type {
	AssetsOnlyResolvedConfig,
	PluginConfig,
	WorkersResolvedConfig,
} from "../plugin-config";

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
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		expect(result.environmentNameToWorkerMap.get("aux_worker")).toBeDefined();
	});

	test("should resolve inline auxiliary worker with config object", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);
		// Create the inline worker's main file
		fs.writeFileSync(path.join(tempDir, "src/aux.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					config: {
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
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const auxWorker =
			result.environmentNameToWorkerMap.get("inline_aux_worker");
		expect(auxWorker).toBeDefined();
		expect(auxWorker?.config.name).toBe("inline-aux-worker");
		// main should now be resolved to an absolute path
		expect(auxWorker?.config.main).toBe(path.join(tempDir, "src/aux.ts"));
	});

	test("should resolve inline auxiliary worker with config function", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);
		// Create the inline worker's main file
		fs.writeFileSync(path.join(tempDir, "src/fn-aux.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					config: () => ({
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
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const auxWorker = result.environmentNameToWorkerMap.get("fn_aux_worker");
		expect(auxWorker).toBeDefined();
		expect(auxWorker?.config.name).toBe("fn-aux-worker");
	});

	test("should auto-populate topLevelName from name if not set", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);
		// Create the inline worker's main file
		fs.writeFileSync(path.join(tempDir, "src/aux.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					config: {
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
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const auxWorker = result.environmentNameToWorkerMap.get("my_aux_worker");
		expect(auxWorker).toBeDefined();
		expect(auxWorker?.config.name).toBe("my-aux-worker");
		expect(auxWorker?.config.topLevelName).toBe("my-aux-worker");
	});

	test("should apply config to file-based auxiliary worker", () => {
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
					config: {
						compatibility_date: "2025-01-01",
					},
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const auxWorker = result.environmentNameToWorkerMap.get("aux_worker");
		expect(auxWorker).toBeDefined();
		// The config should override the file's compatibility_date
		expect(auxWorker?.config.compatibility_date).toBe("2025-01-01");
		// But preserve the name from file
		expect(auxWorker?.config.name).toBe("aux-worker");
	});

	test("should pass entryWorkerConfig as second parameter to auxiliary worker config function", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);
		fs.writeFileSync(path.join(tempDir, "src/aux.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					config: (userConfig, { entryWorkerConfig }) => {
						// Verify we receive both parameters
						expect(userConfig).toBeDefined();
						expect(entryWorkerConfig).toBeDefined();
						expect("name" in entryWorkerConfig).toBe(false);
						expect("topLevelName" in entryWorkerConfig).toBe(false);
						expect(entryWorkerConfig.compatibility_date).toBe("2024-01-01");

						return {
							name: "aux-worker",
							main: "./src/aux.ts",
							// Use entry worker's compatibility_date
							compatibility_date: entryWorkerConfig.compatibility_date,
						};
					},
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const auxWorker = result.environmentNameToWorkerMap.get("aux_worker");
		expect(auxWorker).toBeDefined();
		expect(auxWorker?.config.name).toBe("aux-worker");
		// Should have inherited entry worker's compatibility_date
		expect(auxWorker?.config.compatibility_date).toBe("2024-01-01");
	});

	test("should allow auxiliary worker to inherit entry worker compatibility_flags", () => {
		// Create entry worker with compatibility_flags
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name: "entry-worker",
				main: "./src/index.ts",
				compatibility_date: "2025-01-01",
				compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
			})
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");
		fs.writeFileSync(path.join(tempDir, "src/aux.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			auxiliaryWorkers: [
				{
					config: (_, { entryWorkerConfig }) => ({
						name: "aux-worker",
						main: "./src/aux.ts",
						// Inherit all compatibility settings from entry worker
						compatibility_date: entryWorkerConfig.compatibility_date,
						compatibility_flags: entryWorkerConfig.compatibility_flags,
					}),
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const auxWorker = result.environmentNameToWorkerMap.get("aux_worker");
		expect(auxWorker).toBeDefined();
		expect(auxWorker?.config.compatibility_flags).toEqual(
			expect.arrayContaining(["nodejs_compat", "global_fetch_strictly_public"])
		);
	});

	test("should throw if inline auxiliary worker is missing required fields", () => {
		const entryConfigPath = createEntryWorkerConfig(tempDir);

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					config: {
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

describe("resolvePluginConfig - entry worker config()", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	const viteEnv = { mode: "development", command: "serve" as const };

	test("should convert assets-only worker to worker with server logic when config() adds main", () => {
		// Create a config file without main (assets-only)
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name: "my-worker",
				compatibility_date: "2024-01-01",
				// No main field - would normally be assets-only
			})
		);

		// Create the main file so validation passes
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			config: {
				main: "./src/index.ts",
			},
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		// Should now be a worker with server logic, not assets-only
		expect(result.type).toBe("workers");
		const entryWorker = result.environmentNameToWorkerMap.get(
			result.entryWorkerEnvironmentName
		);
		expect(entryWorker).toBeDefined();
		expect(entryWorker?.config.main).toMatch(/index\.ts$/);
	});

	test("should allow config() function to add main field", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name: "my-worker",
				compatibility_date: "2024-01-01",
			})
		);

		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			config: () => ({
				main: "./src/index.ts",
			}),
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const entryWorker = result.environmentNameToWorkerMap.get(
			result.entryWorkerEnvironmentName
		);
		expect(entryWorker).toBeDefined();
	});

	test("should remain assets-only when config() does not add main", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name: "my-worker",
				compatibility_date: "2024-01-01",
			})
		);

		const pluginConfig: PluginConfig = {
			configPath,
			config: {
				compatibility_flags: ["nodejs_compat"],
			},
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.compatibility_flags).toContain(
			"nodejs_compat"
		);
	});
});

describe("resolvePluginConfig - zero-config mode", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	const viteEnv = { mode: "development", command: "serve" as const };

	test("should return an assets-only config when no wrangler config exists", () => {
		const pluginConfig: PluginConfig = {};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
	});

	test("should derive worker name from package.json name", () => {
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify({ name: "my-awesome-app" })
		);

		const pluginConfig: PluginConfig = {};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.name).toBe("my-awesome-app");
		expect(assetsOnlyResult.config.topLevelName).toBe("my-awesome-app");
	});

	test("should normalize invalid worker names from package.json", () => {
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify({ name: "@scope/my_package_name" })
		);

		const pluginConfig: PluginConfig = {};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		// underscores become dashes, invalid chars removed
		expect(assetsOnlyResult.config.name).toBe("scope-my-package-name");
	});

	test("should fall back to directory name when package.json has no name", () => {
		const namedDir = path.join(tempDir, "my-test-project");
		fs.mkdirSync(namedDir);
		fs.writeFileSync(
			path.join(namedDir, "package.json"),
			JSON.stringify({ version: "1.0.0" })
		);

		const pluginConfig: PluginConfig = {};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: namedDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.name).toBe("my-test-project");
	});

	test("should fall back to directory name when no package.json exists", () => {
		const namedDir = path.join(tempDir, "another-project");
		fs.mkdirSync(namedDir);

		const pluginConfig: PluginConfig = {};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: namedDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.name).toBe("another-project");
	});

	test("should set a compatibility date in zero-config mode", () => {
		const pluginConfig: PluginConfig = {};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.compatibility_date).toMatch(
			/^\d{4}-\d{2}-\d{2}$/
		);
	});

	test("should allow config() to add main in zero-config mode", () => {
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify({ name: "my-worker" })
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			config: {
				main: "./src/index.ts",
			},
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const entryWorker = result.environmentNameToWorkerMap.get(
			result.entryWorkerEnvironmentName
		);
		expect(entryWorker).toBeDefined();
		expect(entryWorker?.config.name).toBe("my-worker");
	});
});

describe("resolvePluginConfig - defaults fill in missing fields", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	const viteEnv = { mode: "development", command: "serve" as const };

	test("should accept Wrangler config file with only name, filling in compatibility_date from defaults", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name: "my-worker",
				// No compatibility_date - should be filled from defaults
			})
		);

		const pluginConfig: PluginConfig = {
			configPath,
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.name).toBe("my-worker");
		// compatibility_date should be filled from defaults (matches date format)
		expect(assetsOnlyResult.config.compatibility_date).toMatch(
			/^\d{4}-\d{2}-\d{2}$/
		);
	});

	test("should accept Wrangler config file missing name when config() provides it", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				compatibility_date: "2024-01-01",
				// No name - should be provided by config()
			})
		);

		const pluginConfig: PluginConfig = {
			configPath,
			config: {
				name: "configured-worker",
			},
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.name).toBe("configured-worker");
	});

	test("should accept Wrangler config file missing compatibility_date when config() provides it", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name: "my-worker",
				// No compatibility_date
			})
		);

		const pluginConfig: PluginConfig = {
			configPath,
			config: {
				compatibility_date: "2025-06-01",
			},
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.type).toBe("assets-only");
		const assetsOnlyResult = result as AssetsOnlyResolvedConfig;
		expect(assetsOnlyResult.config.compatibility_date).toBe("2025-06-01");
	});

	test("should accept minimal Wrangler config file when all required fields come from config()", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				// Minimal config - just empty object or some other field
				compatibility_flags: ["nodejs_compat"],
			})
		);

		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			config: {
				name: "configured-worker",
				compatibility_date: "2025-01-01",
				main: "./src/index.ts",
			},
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const entryWorker = result.environmentNameToWorkerMap.get(
			result.entryWorkerEnvironmentName
		);
		expect(entryWorker).toBeDefined();
		expect(entryWorker?.config.name).toBe("configured-worker");
		expect(entryWorker?.config.compatibility_date).toBe("2025-01-01");
		expect(entryWorker?.config.compatibility_flags).toContain("nodejs_compat");
	});

	test("should accept auxiliary worker Wrangler config file missing fields when config() provides them", () => {
		// Create entry worker config
		const entryConfigPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			entryConfigPath,
			JSON.stringify({
				name: "entry-worker",
				main: "./src/index.ts",
				compatibility_date: "2024-01-01",
			})
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		// Create auxiliary worker config with only some fields
		const auxDir = path.join(tempDir, "aux");
		fs.mkdirSync(auxDir, { recursive: true });
		const auxConfigPath = path.join(auxDir, "wrangler.jsonc");
		fs.writeFileSync(
			auxConfigPath,
			JSON.stringify({
				// Only has main, missing name
				main: "./worker.ts",
			})
		);
		fs.writeFileSync(path.join(auxDir, "worker.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath: entryConfigPath,
			auxiliaryWorkers: [
				{
					configPath: auxConfigPath,
					config: {
						name: "aux-from-config",
					},
				},
			],
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		) as WorkersResolvedConfig;
		expect(result.type).toBe("workers");
		const auxWorker = result.environmentNameToWorkerMap.get("aux_from_config");
		expect(auxWorker).toBeDefined();
		expect(auxWorker?.config.name).toBe("aux-from-config");
		// compatibility_date should be filled from defaults
		expect(auxWorker?.config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("resolvePluginConfig - environment name validation", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	const viteEnv = { mode: "development", command: "serve" as const };

	test("throws when environment name is 'client'", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({ name: "entry-worker", main: "./src/index.ts" })
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			viteEnvironment: { name: "client" },
		};

		expect(() =>
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).toThrow('"client" is a reserved Vite environment name');
	});

	test("throws when child environment duplicates parent", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({ name: "entry-worker", main: "./src/index.ts" })
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			viteEnvironment: { childEnvironments: ["entry_worker"] },
		};

		expect(() =>
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).toThrow('Duplicate Vite environment name: "entry_worker"');
	});

	test("throws when child environments duplicate each other", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({ name: "entry-worker", main: "./src/index.ts" })
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			viteEnvironment: { childEnvironments: ["child", "child"] },
		};

		expect(() =>
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).toThrow('Duplicate Vite environment name: "child"');
	});

	test("throws when auxiliary Worker duplicates entry Worker", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({ name: "entry-worker", main: "./src/index.ts" })
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const auxDir = path.join(tempDir, "aux");
		fs.mkdirSync(auxDir, { recursive: true });
		fs.writeFileSync(
			path.join(auxDir, "wrangler.jsonc"),
			JSON.stringify({ name: "aux-worker", main: "./worker.ts" })
		);
		fs.writeFileSync(path.join(auxDir, "worker.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			auxiliaryWorkers: [
				{
					configPath: path.join(auxDir, "wrangler.jsonc"),
					viteEnvironment: { name: "entry_worker" },
				},
			],
		};

		expect(() =>
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).toThrow('Duplicate Vite environment name: "entry_worker"');
	});

	test("throws when auxiliary Worker child duplicates entry Worker", () => {
		const configPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			configPath,
			JSON.stringify({ name: "entry-worker", main: "./src/index.ts" })
		);
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		const auxDir = path.join(tempDir, "aux");
		fs.mkdirSync(auxDir, { recursive: true });
		fs.writeFileSync(
			path.join(auxDir, "wrangler.jsonc"),
			JSON.stringify({ name: "aux-worker", main: "./worker.ts" })
		);
		fs.writeFileSync(path.join(auxDir, "worker.ts"), "export default {}");

		const pluginConfig: PluginConfig = {
			configPath,
			auxiliaryWorkers: [
				{
					configPath: path.join(auxDir, "wrangler.jsonc"),
					viteEnvironment: { childEnvironments: ["entry_worker"] },
				},
			],
		};

		expect(() =>
			resolvePluginConfig(pluginConfig, { root: tempDir }, viteEnv)
		).toThrow('Duplicate Vite environment name: "entry_worker"');
	});
});
