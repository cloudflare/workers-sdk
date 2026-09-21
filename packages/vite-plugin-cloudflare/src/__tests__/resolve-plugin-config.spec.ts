import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { resolvePluginConfig } from "../plugin-config";
import type {
	AssetsOnlyResolvedConfig,
	PluginConfig,
	WorkersResolvedConfig,
} from "../plugin-config";
import type { InputWorkerConfig } from "@cloudflare/config";

const { readBuildOutputPreviewMock } = vi.hoisted(() => ({
	readBuildOutputPreviewMock: vi.fn(),
}));

vi.mock("../build-output-preview", async (importOriginal) => ({
	...(await importOriginal<typeof import("../build-output-preview")>()),
	readBuildOutputPreview: readBuildOutputPreviewMock,
}));

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "plugin-config");
const buildEnv = { mode: "production", command: "build" as const };

describe("resolvePluginConfig", () => {
	let root: string;

	beforeEach(() => {
		readBuildOutputPreviewMock.mockReset();
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
	}) {
		if (!options?.assetsOnly && !options?.noEntrypoint) {
			writeSource("src/index.ts");
		}
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { defineConfig } from '@cloudflare/config';",
				"export default defineConfig({",
				"  worker: {",
				"    name: 'entry-worker',",
				options?.assetsOnly
					? "    assets: {},"
					: options?.noEntrypoint
						? ""
						: `    entrypoint: ${JSON.stringify(options?.entrypoint ?? "./src/index.ts")},`,
				"    compatibilityDate: '2024-12-30',",
				options?.compatibilityFlags
					? `    compatibilityFlags: ${JSON.stringify(options.compatibilityFlags)},`
					: "",
				"  },",
				"});",
			].join("\n")
		);
	}

	function createAuxiliaryWorkerConfig(
		name: string,
		overrides: Partial<InputWorkerConfig> = {}
	): InputWorkerConfig {
		return {
			name,
			entrypoint: "./src/aux.ts",
			compatibilityDate: "2024-12-30",
			...overrides,
		};
	}

	test("rejects a cloudflare.config.ts without a Worker", async ({
		expect,
	}) => {
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			"export default {};"
		);

		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			"`cloudflare.config.ts` must define a Worker using the `worker` property."
		);
	});

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

	test.for(["src/index.ts", "./src/missing.ts"] as const)(
		"preserves the %s filesystem entrypoint for Vite to resolve",
		async (entrypoint, { expect }) => {
			writeEntryConfig({ entrypoint });
			const result = (await resolvePluginConfig(
				{},
				{ root },
				buildEnv
			)) as WorkersResolvedConfig;

			expect(
				result.environmentNameToWorkerMap.get(result.entryWorkerEnvironmentName)
					?.config.entrypoint
			).toBe(entrypoint);
		}
	);

	test("resolves an auxiliary Worker from the entry Worker config", async ({
		expect,
	}) => {
		writeEntryConfig({
			compatibilityFlags: ["nodejs_compat"],
		});
		writeSource("src/aux.ts");

		const result = (await resolvePluginConfig(
			{
				config: { compatibilityDate: "2025-02-02" },
				auxiliaryWorkers: [
					{
						viteEnvironment: { name: "auxiliary" },
						config: ({ entryWorkerConfig }) => ({
							name: `${entryWorkerConfig.name}-auxiliary-${entryWorkerConfig.compatibilityDate}`,
							entrypoint: "./src/aux.ts",
							compatibilityDate: "2025-01-15",
						}),
					},
				],
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		const auxiliary = result.environmentNameToWorkerMap.get("auxiliary");
		expect(auxiliary?.config).toMatchObject({
			name: "entry-worker-auxiliary-2025-02-02",
			entrypoint: "./src/aux.ts",
			compatibilityDate: "2025-01-15",
		});
		expect(auxiliary?.config.compatibilityFlags).toBeUndefined();
		expect(auxiliary?.directoryName).toBe("entry-worker-auxiliary-2025-02-02");
	});

	test("resolves an entry Worker config customizer result", async ({
		expect,
	}) => {
		writeEntryConfig({ compatibilityFlags: ["flag-a"] });
		const result = (await resolvePluginConfig(
			{
				config: (workerConfig) => ({
					name: `customized-${workerConfig.name}`,
					compatibilityFlags: ["flag-b"],
				}),
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		const entryWorker = result.environmentNameToWorkerMap.get("ssr");
		expect(entryWorker?.config.name).toBe("customized-entry-worker");
		expect(entryWorker?.config.compatibilityFlags).toEqual(
			expect.arrayContaining(["flag-a", "flag-b"])
		);
	});

	test("resolves an in-place entry Worker config customization", async ({
		expect,
	}) => {
		writeEntryConfig();
		const result = (await resolvePluginConfig(
			{
				config(workerConfig) {
					workerConfig.compatibilityDate = "2025-06-01";
				},
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(
			result.environmentNameToWorkerMap.get("ssr")?.config.compatibilityDate
		).toBe("2025-06-01");
	});

	test("resolves entry and auxiliary Workers configured only in Vite", async ({
		expect,
	}) => {
		writeSource("src/index.ts");
		writeSource("src/aux.ts");
		const result = await resolvePluginConfig(
			{
				config: { entrypoint: "./src/index.ts" },
				auxiliaryWorkers: [
					{ config: createAuxiliaryWorkerConfig("viteOnlyWorker") },
				],
			},
			{ root },
			buildEnv
		);

		expect(result.type).toBe("workers");
		if (result.type === "workers") {
			expect(
				result.environmentNameToWorkerMap.get(result.entryWorkerEnvironmentName)
					?.config.entrypoint
			).toBe("./src/index.ts");
			expect(
				result.environmentNameToWorkerMap.get("viteOnlyWorker")?.config
					.entrypoint
			).toBe("./src/aux.ts");
			expect(result.configPaths).toEqual(new Set());
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

	test("normalizes the auxiliary Worker Build Output directory", async ({
		expect,
	}) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		const result = (await resolvePluginConfig(
			{
				auxiliaryWorkers: [
					{ config: createAuxiliaryWorkerConfig("API-Production") },
				],
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(
			result.environmentNameToWorkerMap.get("API_Production")?.directoryName
		).toBe("api-production");
	});

	test.for([
		["default", "_default"],
		["prerender", "_prerender"],
	] as const)(
		"escapes the reserved %s auxiliary Worker Build Output directory",
		async ([workerName, expectedDirectoryName], { expect }) => {
			writeEntryConfig();
			writeSource("src/aux.ts");
			const result = (await resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{ config: createAuxiliaryWorkerConfig(workerName) },
					],
				},
				{ root },
				buildEnv
			)) as WorkersResolvedConfig;

			expect(
				result.environmentNameToWorkerMap.get(workerName)?.directoryName
			).toBe(expectedDirectoryName);
		}
	);

	test("rejects auxiliary Worker Build Output directory collisions", async ({
		expect,
	}) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		await expect(
			resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{ config: createAuxiliaryWorkerConfig("worker-a") },
						{ config: createAuxiliaryWorkerConfig("WORKER-A") },
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/both produce.*`worker-a`/);
	});

	test("rejects duplicate Worker names", async ({ expect }) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		await expect(
			resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{ config: createAuxiliaryWorkerConfig("entry-worker") },
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow('Duplicate Worker name: "entry-worker"');
	});

	test("includes every configured auxiliary Worker", async ({ expect }) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		const result = await resolvePluginConfig(
			{
				auxiliaryWorkers: [
					{ config: createAuxiliaryWorkerConfig("auxiliary-worker-a") },
					{ config: createAuxiliaryWorkerConfig("auxiliary-worker-b") },
				],
			},
			{ root },
			buildEnv
		);
		expect(result.type).toBe("workers");
		if (result.type === "workers") {
			expect(result.environmentNameToWorkerMap.has("auxiliary_worker_a")).toBe(
				true
			);
			expect(result.environmentNameToWorkerMap.has("auxiliary_worker_b")).toBe(
				true
			);
		}
	});

	test("requires an auxiliary Worker entrypoint", async ({ expect }) => {
		writeEntryConfig();
		await expect(
			resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{
							config: {
								name: "auxiliary-worker",
								compatibilityDate: "2024-12-30",
							},
						},
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(
			/Auxiliary and prerender Workers must configure an `entrypoint`/
		);
	});

	test("rejects assets on an auxiliary Worker", async ({ expect }) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		await expect(
			resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{
							config: createAuxiliaryWorkerConfig("auxiliary-worker", {
								assets: {},
							}),
						},
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/assets are only supported by the default Worker/);
	});

	test("rejects assets on the prerender Worker", async ({ expect }) => {
		writeEntryConfig();
		writeSource("src/prerender.ts");
		await expect(
			resolvePluginConfig(
				{
					prerenderWorker: {
						config: {
							name: "prerender-worker",
							entrypoint: "./src/prerender.ts",
							compatibilityDate: "2024-12-30",
							assets: {},
						},
					},
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/assets are only supported by the default Worker/);
	});

	test("resolves the prerender Worker during build", async ({ expect }) => {
		writeEntryConfig();
		writeSource("src/prerender.ts");
		const result = (await resolvePluginConfig(
			{
				prerenderWorker: {
					config: {
						name: "prerender-worker",
						entrypoint: "./src/prerender.ts",
						compatibilityDate: "2024-12-30",
					},
				},
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(result.prerenderWorkerEnvironmentName).toBe("prerender_worker");
		expect(
			result.environmentNameToWorkerMap.get("prerender_worker")?.config
				.entrypoint
		).toBe("./src/prerender.ts");
	});

	test("configures the prerender Worker from the entry Worker config", async ({
		expect,
	}) => {
		writeEntryConfig();
		writeSource("src/prerender.ts");
		const result = (await resolvePluginConfig(
			{
				prerenderWorker: {
					viteEnvironment: { name: "prerender" },
					config: ({ entryWorkerConfig }) => ({
						name: `prerender-${entryWorkerConfig.compatibilityDate}`,
						entrypoint: "./src/prerender.ts",
						compatibilityDate: "2025-01-15",
					}),
				},
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(
			result.environmentNameToWorkerMap.get("prerender")?.config.name
		).toBe("prerender-2024-12-30");
	});

	test("resolves an inline prerender Worker during build", async ({
		expect,
	}) => {
		writeEntryConfig();
		writeSource("src/prerender.ts");
		const result = (await resolvePluginConfig(
			{
				prerenderWorker: {
					config({ entryWorkerConfig }) {
						return {
							...entryWorkerConfig,
							name: "prerender-worker",
							entrypoint: "./src/prerender.ts",
						};
					},
				},
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		expect(result.prerenderWorkerEnvironmentName).toBe("prerender_worker");
		expect(
			result.environmentNameToWorkerMap.get("prerender_worker")?.config
				.entrypoint
		).toBe("./src/prerender.ts");
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
		writeEntryConfig({ assetsOnly: true });
		writeSource("src/aux.ts");
		const result = await resolvePluginConfig(
			{
				auxiliaryWorkers: [
					{ config: createAuxiliaryWorkerConfig("auxiliary-worker") },
				],
			},
			{ root },
			buildEnv
		);

		expect(result.type).toBe("assets-only");
		if (result.type === "assets-only") {
			expect(
				result.environmentNameToWorkerMap.get("auxiliary_worker")?.directoryName
			).toBe("auxiliary-worker");
		}
	});

	test("resolves Cloudflare environment files from Vite's envDir and exposes Cloudflare-prefixed values to process.env", async ({
		expect,
	}) => {
		writeEntryConfig();
		const envDir = path.join(root, "environment");
		fs.mkdirSync(envDir);
		fs.writeFileSync(
			path.join(envDir, ".env.production"),
			"CLOUDFLARE_VITE_FORCE_LOCAL=true\nCLOUDFLARE_ACCOUNT_ID=test-account-id"
		);
		fs.writeFileSync(
			path.join(envDir, ".dev.vars.production"),
			"CLOUDFLARE_ACCOUNT_ID=from-dev-vars"
		);
		vi.stubEnv("CLOUDFLARE_VITE_FORCE_LOCAL", undefined);
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);

		const result = await resolvePluginConfig(
			{ remoteBindings: true },
			{ root, envDir: "environment" },
			buildEnv
		);

		expect(result.remoteBindings).toBe(false);
		expect(result.localEnv.values.CLOUDFLARE_VITE_FORCE_LOCAL).toBe("true");
		expect(result.devVars?.CLOUDFLARE_ACCOUNT_ID).toBe("from-dev-vars");
		expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBe("test-account-id");
	});

	test("honours Vite's envDir false option", async ({ expect }) => {
		writeEntryConfig();
		fs.writeFileSync(
			path.join(root, ".env.production"),
			"CLOUDFLARE_VITE_FORCE_LOCAL=true"
		);
		vi.stubEnv("CLOUDFLARE_VITE_FORCE_LOCAL", undefined);

		const result = await resolvePluginConfig(
			{ remoteBindings: true },
			{ root, envDir: false },
			buildEnv
		);

		expect(result.remoteBindings).toBe(true);
	});

	test("rejects duplicate Vite environment names", async ({ expect }) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		await expect(
			resolvePluginConfig(
				{
					viteEnvironment: { name: "worker" },
					auxiliaryWorkers: [
						{
							viteEnvironment: { name: "worker" },
							config: createAuxiliaryWorkerConfig("auxiliary-worker"),
						},
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/Duplicate Vite environment name: "worker"/);
	});

	test("preview reads only the Build Output Specification", async ({
		expect,
	}) => {
		readBuildOutputPreviewMock.mockResolvedValue({
			rootConfig: { buildContext: { isPreview: false } },
			workers: [
				{
					config: {
						name: "preview-worker",
						compatibilityDate: "2024-12-30",
					},
					assetsDir: undefined,
					bundle: undefined,
				},
			],
		});

		const result = await resolvePluginConfig(
			{} satisfies PluginConfig,
			{ root },
			{ mode: "production", command: "serve", isPreview: true }
		);

		expect(result.type).toBe("preview");
		expect(readBuildOutputPreviewMock).toHaveBeenCalledWith(root, false);
		if (result.type === "preview") {
			expect(result.workers[0]?.config.name).toBe("preview-worker");
		}
	});

	test("preview selects the prerender Build Output during a build", async ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_VITE_BUILD", "true");
		readBuildOutputPreviewMock.mockResolvedValue({
			rootConfig: { buildContext: { isPreview: false } },
			workers: [],
		});

		await resolvePluginConfig(
			{} satisfies PluginConfig,
			{ root },
			{ mode: "production", command: "serve", isPreview: true }
		);

		expect(readBuildOutputPreviewMock).toHaveBeenCalledWith(root, true);
	});

	test("preview loads local env using the mode recorded in Build Output", async ({
		expect,
	}) => {
		fs.writeFileSync(
			path.join(root, ".env.production"),
			"PREVIEW_MODE_VALUE=preview-mode"
		);
		fs.writeFileSync(
			path.join(root, ".env.staging"),
			"PREVIEW_MODE_VALUE=build-mode"
		);
		fs.writeFileSync(
			path.join(root, ".dev.vars.production"),
			"PREVIEW_SECRET=preview-mode"
		);
		fs.writeFileSync(
			path.join(root, ".dev.vars.staging"),
			"PREVIEW_SECRET=build-mode"
		);
		readBuildOutputPreviewMock.mockResolvedValue({
			rootConfig: {
				buildContext: { isPreview: false, mode: "staging" },
			},
			workers: [
				{
					config: {
						name: "preview-worker",
						compatibilityDate: "2024-12-30",
					},
					assetsDir: undefined,
					bundle: undefined,
				},
			],
		});

		const result = await resolvePluginConfig(
			{} satisfies PluginConfig,
			{ root },
			{ mode: "production", command: "serve", isPreview: true }
		);

		expect(result.type).toBe("preview");
		expect(result.localEnv.values.PREVIEW_MODE_VALUE).toBe("build-mode");
		expect(result.devVars?.PREVIEW_SECRET).toBe("build-mode");
	});

	test("preview uses all Workers read from Build Output", async ({
		expect,
	}) => {
		readBuildOutputPreviewMock.mockResolvedValue({
			rootConfig: { buildContext: { isPreview: false } },
			workers: [
				{
					config: {
						name: "entry-worker",
						compatibilityDate: "2024-12-30",
					},
					assetsDir: undefined,
					bundle: undefined,
				},
			],
		});
		const result = await resolvePluginConfig(
			{
				auxiliaryWorkers: [
					{ config: createAuxiliaryWorkerConfig("ignored-during-preview") },
				],
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
