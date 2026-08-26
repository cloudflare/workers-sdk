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
	}) {
		if (!options?.assetsOnly) {
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
					: `  entrypoint: ${JSON.stringify(options?.entrypoint ?? "./src/index.ts")},`,
				"  compatibilityDate: '2024-12-30',",
				options?.compatibilityFlags
					? `  compatibilityFlags: ${JSON.stringify(options.compatibilityFlags)},`
					: "",
				"});",
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

	test("rejects a file entrypoint that does not exist", async ({ expect }) => {
		writeEntryConfig({ entrypoint: "./src/missing.ts" });

		await expect(resolvePluginConfig({}, { root }, buildEnv)).rejects.toThrow(
			/The configured Worker entrypoint \(.*?missing\.ts\) doesn't point to an existing file/
		);
	});

	test("resolves a self-contained inline auxiliary Worker", async ({
		expect,
	}) => {
		writeEntryConfig({ compatibilityFlags: ["nodejs_compat"] });
		writeSource("src/aux.ts");

		const result = (await resolvePluginConfig(
			{
				auxiliaryWorkers: [
					{
						config: ({ entryWorkerConfig }) => ({
							name: `aux-${entryWorkerConfig.compatibilityDate}`,
							entrypoint: "./src/aux.ts",
							compatibilityDate: "2025-01-15",
						}),
					},
				],
			},
			{ root },
			buildEnv
		)) as WorkersResolvedConfig;

		const auxiliary = result.environmentNameToWorkerMap.get("aux_2024_12_30");
		expect(auxiliary?.config).toMatchObject({
			name: "aux-2024-12-30",
			entrypoint: path.join(root, "src/aux.ts"),
			compatibilityDate: "2025-01-15",
		});
		expect(auxiliary?.config.compatibilityFlags).toBeUndefined();
	});

	test("requires an inline auxiliary compatibility date", async ({
		expect,
	}) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		await expect(
			resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{
							// @ts-expect-error The runtime validation should also reject this.
							config: {
								name: "auxiliary",
								entrypoint: "./src/aux.ts",
							},
						},
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/compatibilityDate/);
	});

	test("requires an inline auxiliary entrypoint", async ({ expect }) => {
		writeEntryConfig();
		await expect(
			resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{
							config: {
								name: "auxiliary",
								compatibilityDate: "2024-12-30",
							},
						},
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/No 'entrypoint' field provided for an inline Worker/);
	});

	test("rejects assets on an auxiliary Worker", async ({ expect }) => {
		writeEntryConfig();
		writeSource("src/aux.ts");
		await expect(
			resolvePluginConfig(
				{
					auxiliaryWorkers: [
						{
							config: {
								name: "auxiliary",
								entrypoint: "./src/aux.ts",
								compatibilityDate: "2024-12-30",
								assets: {},
							},
						},
					],
				},
				{ root },
				buildEnv
			)
		).rejects.toThrow(/`assets` is not supported on an auxiliary Worker/);
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
						config: {
							name: "prerender-worker",
							entrypoint: "./src/prerender.ts",
							compatibilityDate: "2024-12-30",
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
							config: {
								name: "auxiliary",
								entrypoint: "./src/aux.ts",
								compatibilityDate: "2024-12-30",
							},
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
		expect(readBuildOutputWorkersMock).toHaveBeenCalledWith(root);
		if (result.type === "preview") {
			expect(result.workers[0]?.config.name).toBe("preview-worker");
		}
	});

	test("preview ignores auxiliary Workers and reads only Build Output", async ({
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
				auxiliaryWorkers: [
					{
						config: {
							name: "unsupported-in-preview",
							entrypoint: "./src/unused.ts",
							compatibilityDate: "2024-12-30",
						},
					},
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
