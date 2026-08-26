import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import {
	resolvePluginConfig,
	workerExportNameToDirectoryName,
} from "../plugin-config";
import type {
	AssetsOnlyResolvedConfig,
	PluginConfig,
	WorkersResolvedConfig,
} from "../plugin-config";

const { readBuildOutputWorkersMock } = vi.hoisted(() => ({
	readBuildOutputWorkersMock: vi.fn(),
}));

vi.mock("../build-output-preview", async (importOriginal) => ({
	...(await importOriginal<typeof import("../build-output-preview")>()),
	readBuildOutputWorkers: readBuildOutputWorkersMock,
}));

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "plugin-config");
const buildEnv = { mode: "production", command: "build" as const };

describe("resolvePluginConfig", () => {
	let root: string;

	beforeEach(() => {
		readBuildOutputWorkersMock.mockReset();
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		root = fs.realpathSync(fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-")));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		removeDirSync(root);
	});

	function writeSource(relativePath: string) {
		const sourcePath = path.join(root, relativePath);
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "export default {};");
	}

	function writeEntryConfig(options?: {
		assetsOnly?: boolean;
		compatibilityFlags?: string[];
		entrypoint?: string;
		noEntrypoint?: boolean;
		namedWorkers?: Array<{
			exportName: string;
			name?: string;
			entrypoint?: string;
			compatibilityDate?: string;
			assets?: boolean;
		}>;
	}) {
		if (!options?.assetsOnly && !options?.noEntrypoint) {
			writeSource("src/index.ts");
		}
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
				"  name: 'entry-worker',",
				options?.assetsOnly
					? "  assets: {},"
					: options?.noEntrypoint
						? ""
						: `  entrypoint: ${JSON.stringify(options?.entrypoint ?? "./src/index.ts")},`,
				"  compatibilityDate: '2024-12-30',",
				options?.compatibilityFlags
					? `  compatibilityFlags: ${JSON.stringify(options.compatibilityFlags)},`
					: "",
				"});",
				...(options?.namedWorkers ?? []).flatMap((worker) => [
					`export const ${worker.exportName} = defineWorker({`,
					`  name: ${JSON.stringify(worker.name ?? worker.exportName)},`,
					worker.entrypoint
						? `  entrypoint: ${JSON.stringify(worker.entrypoint)},`
						: "",
					`  compatibilityDate: ${JSON.stringify(worker.compatibilityDate ?? "2024-12-30")},`,
					worker.assets ? "  assets: {}," : "",
					"});",
				]),
			].join("\n")
		);
	}

	test("preserves package entrypoints for Vite to resolve", async ({
		expect,
	}) => {
		const entrypoint = "@playground/main-resolution-package/entry";
		writeEntryConfig({ entrypoint });
		const result = (await resolvePluginConfig(
			{},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(
			result.environmentNameToWorkerMap.get("ssr")?.config.entrypoint
		).toBe(entrypoint);
	});

	test("preserves virtual module entrypoints for Vite to resolve", async ({
		expect,
	}) => {
		const entrypoint = "virtual:entry";
		writeEntryConfig({ entrypoint });
		const result = (await resolvePluginConfig(
			{},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(
			result.environmentNameToWorkerMap.get("ssr")?.config.entrypoint
		).toBe(entrypoint);
	});

	test.for([
		["auxiliaryWorker", "auxiliary-worker"],
		["Worker_B", "worker-b"],
		["HTTPServer", "http-server"],
		["worker--name", "worker-name"],
	] as const)(
		"converts the %s export to the %s Build Output directory",
		([exportName, expectedDirectoryName], { expect }) => {
			expect(workerExportNameToDirectoryName(exportName)).toBe(
				expectedDirectoryName
			);
		}
	);

	test("rejects a file entrypoint that does not exist", async ({ expect }) => {
		writeEntryConfig({ entrypoint: "./src/missing.ts" });

		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			/The configured Worker entrypoint \(.*?missing\.ts\) doesn't point to an existing file/
		);
	});

	test("resolves and customizes a named auxiliary Worker export", async ({
		expect,
	}) => {
		writeEntryConfig({
			compatibilityFlags: ["nodejs_compat"],
			namedWorkers: [
				{
					exportName: "auxiliaryWorker",
					name: "auxiliary",
					entrypoint: "./src/aux.ts",
				},
			],
		});
		writeSource("src/aux.ts");

		const result = (await resolvePluginConfig(
			{
				auxiliaryWorkers: {
					auxiliaryWorker: {
						viteEnvironment: { name: "auxiliary" },
						config: (config, { entryWorkerConfig }) => ({
							name: `${config.name}-${entryWorkerConfig.compatibilityDate}`,
							entrypoint: "./src/aux.ts",
							compatibilityDate: "2025-01-15",
						}),
					},
				},
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		const auxiliary = result.environmentNameToWorkerMap.get("auxiliary");
		expect(auxiliary?.config).toMatchObject({
			name: "auxiliary-2024-12-30",
			entrypoint: path.join(root, "src/aux.ts"),
			compatibilityDate: "2025-01-15",
		});
		expect(auxiliary?.config.compatibilityFlags).toBeUndefined();
		expect(auxiliary?.directoryName).toBe("auxiliary-worker");
	});

	test("resolves entry and auxiliary Workers configured only in Vite", async ({
		expect,
	}) => {
		writeSource("src/index.ts");
		writeSource("src/aux.ts");
		const result = await resolvePluginConfig(
			{
				config: { entrypoint: "./src/index.ts" },
				auxiliaryWorkers: {
					viteOnlyWorker: {
						config: { entrypoint: "./src/aux.ts" },
					},
				},
			},
			{ root },
			buildEnv
		);

		expect(result.type).toBe("workers");
		if (result.type === "workers") {
			expect(
				result.environmentNameToWorkerMap.get(result.entryWorkerEnvironmentName)
					?.config.entrypoint
			).toBe(path.join(root, "src/index.ts"));
			expect(
				result.environmentNameToWorkerMap.get("viteOnlyWorker")?.config
					.entrypoint
			).toBe(path.join(root, "src/aux.ts"));
			expect(result.configPaths).toEqual(new Set());
			expect(result.parsedConfig).toEqual({});
		}
	});

	test("skips type generation when cloudflare.config.ts does not exist", async ({
		expect,
	}) => {
		await resolvePluginConfig(
			{},
			{ root },
			{ mode: "development", command: "serve" }
		);

		expect(fs.existsSync(path.join(root, "worker-configuration.d.ts"))).toBe(
			false
		);
	});

	test.for(["default", "prerender"])(
		"rejects the reserved %s auxiliary Worker export name",
		async (exportName, { expect }) => {
			writeEntryConfig();
			await expect(
				resolvePluginConfig(
					{ auxiliaryWorkers: { [exportName]: {} } },
					{ root },
					buildEnv
				)
			).rejects.toThrow(
				`The \`${exportName}\` export is reserved and cannot be configured through \`auxiliaryWorkers\`.`
			);
		}
	);

	test.for([
		["Prerender", "prerender"],
		["CON", "con"],
	] as const)(
		"rejects the %s export because its Build Output directory %s is reserved",
		async ([exportName, directoryName], { expect }) => {
			writeEntryConfig({
				namedWorkers: [{ exportName, entrypoint: "./src/aux.ts" }],
			});
			writeSource("src/aux.ts");
			await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
				`reserved Build Output directory name \`${directoryName}\``
			);
		}
	);

	test("rejects auxiliary Worker export names without a usable directory name", async ({
		expect,
	}) => {
		writeEntryConfig({
			namedWorkers: [{ exportName: "$", entrypoint: "./src/aux.ts" }],
		});
		writeSource("src/aux.ts");
		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			/does not produce a valid Build Output directory name/
		);
	});

	test("rejects auxiliary Worker Build Output directory collisions", async ({
		expect,
	}) => {
		writeEntryConfig({
			namedWorkers: [
				{ exportName: "workerA", entrypoint: "./src/aux.ts" },
				{ exportName: "worker_a", entrypoint: "./src/aux.ts" },
			],
		});
		writeSource("src/aux.ts");
		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			/`worker_a` and `workerA` auxiliary Worker exports both produce the Build Output directory name `worker-a`/
		);
	});

	test("includes every named Worker export as an auxiliary Worker", async ({
		expect,
	}) => {
		writeEntryConfig({
			namedWorkers: [
				{ exportName: "auxiliaryWorker", entrypoint: "./src/aux.ts" },
			],
		});
		writeSource("src/aux.ts");
		const result = await resolvePluginConfig({}, { root }, buildEnv);
		expect(result.type).toBe("workers");
		if (result.type === "workers") {
			expect(result.environmentNameToWorkerMap.has("auxiliaryWorker")).toBe(
				true
			);
		}
	});

	test("requires a named auxiliary Worker entrypoint", async ({ expect }) => {
		writeEntryConfig({
			namedWorkers: [{ exportName: "auxiliaryWorker" }],
		});
		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			/Auxiliary and prerender Workers must configure an `entrypoint`/
		);
	});

	test("rejects assets on an auxiliary Worker", async ({ expect }) => {
		writeEntryConfig({
			namedWorkers: [
				{
					exportName: "auxiliaryWorker",
					entrypoint: "./src/aux.ts",
					assets: true,
				},
			],
		});
		writeSource("src/aux.ts");
		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			/`assets` is only supported on the default Worker/
		);
	});

	test("rejects assets on the prerender Worker", async ({ expect }) => {
		writeEntryConfig({
			namedWorkers: [
				{
					exportName: "prerender",
					entrypoint: "./src/prerender.ts",
					assets: true,
				},
			],
		});
		writeSource("src/prerender.ts");
		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			/`assets` is only supported on the default Worker/
		);
	});

	test("resolves the prerender Worker export during build", async ({
		expect,
	}) => {
		writeEntryConfig({
			namedWorkers: [
				{
					exportName: "prerender",
					name: "prerender-worker",
					entrypoint: "./src/prerender.ts",
				},
			],
		});
		writeSource("src/prerender.ts");
		const result = (await resolvePluginConfig(
			{},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(result.prerenderWorkerEnvironmentName).toBe("prerender");
		expect(
			result.environmentNameToWorkerMap.get("prerender")?.config.entrypoint
		).toBe(path.join(root, "src/prerender.ts"));
	});

	test("customizes the prerender Worker export", async ({ expect }) => {
		writeEntryConfig({
			namedWorkers: [
				{
					exportName: "prerender",
					entrypoint: "./src/prerender.ts",
				},
			],
		});
		writeSource("src/prerender.ts");
		const result = (await resolvePluginConfig(
			{
				experimental: {
					prerenderWorker: {
						config: (config, { entryWorkerConfig }) => ({
							name: `${config.name}-${entryWorkerConfig.compatibilityDate}`,
						}),
					},
				},
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(
			result.environmentNameToWorkerMap.get(
				result.prerenderWorkerEnvironmentName ?? ""
			)?.config.name
		).toBe("prerender-2024-12-30");
	});

	test("resolves an inline prerender Worker during build", async ({
		expect,
	}) => {
		writeEntryConfig();
		writeSource("src/prerender.ts");
		const result = (await resolvePluginConfig(
			{
				experimental: {
					prerenderWorker: {
						config(_, { entryWorkerConfig }) {
							return {
								...entryWorkerConfig,
								name: "prerender-worker",
								entrypoint: "./src/prerender.ts",
							};
						},
					},
				},
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(result.prerenderWorkerEnvironmentName).toBe("prerender");
		expect(
			result.environmentNameToWorkerMap.get("prerender")?.config.entrypoint
		).toBe(path.join(root, "src/prerender.ts"));
	});

	test("supports an assets-only entry Worker", async ({ expect }) => {
		writeEntryConfig({ assetsOnly: true });
		const result = (await resolvePluginConfig(
			{},
			{ root },
			buildEnv
		)) as AssetsOnlyResolvedConfig;

		expect(result.type).toBe("assets-only");
		expect(result.config).toMatchObject({
			name: "entry-worker",
			assets: {},
		});
	});

	test("supports an assets-only entry Worker without an assets config", async ({
		expect,
	}) => {
		writeEntryConfig({ noEntrypoint: true });
		const result = await resolvePluginConfig({}, { root }, buildEnv);

		expect(result.type).toBe("assets-only");
		if (result.type === "assets-only") {
			expect(result.config.assets).toBeUndefined();
		}
	});

	test("supports auxiliary Workers with an assets-only default export", async ({
		expect,
	}) => {
		writeEntryConfig({
			assetsOnly: true,
			namedWorkers: [
				{
					exportName: "auxiliaryWorker",
					entrypoint: "./src/aux.ts",
				},
			],
		});
		writeSource("src/aux.ts");
		const result = await resolvePluginConfig({}, { root }, buildEnv);

		expect(result.type).toBe("assets-only");
		if (result.type === "assets-only") {
			expect(
				result.environmentNameToWorkerMap.get("auxiliaryWorker")?.directoryName
			).toBe("auxiliary-worker");
		}
	});
	test("rejects duplicate Vite environment names", async ({ expect }) => {
		writeEntryConfig({
			namedWorkers: [
				{
					exportName: "worker",
					entrypoint: "./src/aux.ts",
				},
			],
		});
		writeSource("src/aux.ts");
		await expect(
			resolvePluginConfig(
				{
					viteEnvironment: { name: "worker" },
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/Duplicate Vite environment name: "worker"/);
	});

	test("preview reads only the Build Output Specification", async ({
		expect,
	}) => {
		readBuildOutputWorkersMock.mockResolvedValue([
			{
				source: "build-output",
				config: {
					type: "worker",
					name: "preview-worker",
					compatibilityDate: "2024-12-30",
				},
				settings: undefined,
				assetsDir: undefined,
				bundle: undefined,
			},
		]);

		const result = await resolvePluginConfig(
			{} satisfies PluginConfig,
			{ root },
			{ mode: "production", command: "serve", isPreview: true }
		);

		expect(result.type).toBe("preview");
		expect(readBuildOutputWorkersMock).toHaveBeenCalledWith(root, false);
		if (result.type === "preview") {
			expect(result.workers[0]?.config.name).toBe("preview-worker");
		}
	});

	test("preview selects the prerender Build Output during a build", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_VITE_BUILD", "true");
		readBuildOutputWorkersMock.mockResolvedValue([]);

		await resolvePluginConfig(
			{} satisfies PluginConfig,
			{ root },
			{ mode: "production", command: "serve", isPreview: true }
		);

		expect(readBuildOutputWorkersMock).toHaveBeenCalledWith(root, true);
	});

	test("preview ignores Vite Worker config and reads only Build Output", async ({
		expect,
	}) => {
		readBuildOutputWorkersMock.mockResolvedValue([
			{
				source: "build-output",
				config: {
					type: "worker",
					name: "entry-worker",
					compatibilityDate: "2024-12-30",
				},
				settings: undefined,
				assetsDir: undefined,
				bundle: undefined,
			},
		]);
		const result = await resolvePluginConfig(
			{
				auxiliaryWorkers: { ignoredDuringPreview: {} },
			},
			{ root },
			{ mode: "production", command: "serve", isPreview: true }
		);

		expect(result.type).toBe("preview");
		if (result.type === "preview") {
			expect(result.workers).toHaveLength(1);
			expect(result.workers[0]?.config.name).toBe("entry-worker");
		}
	});
});
