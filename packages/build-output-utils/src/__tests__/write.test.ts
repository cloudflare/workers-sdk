import * as fs from "node:fs";
import * as path from "node:path";
import {
	SettingsSchema,
	WorkerConfigSchema,
	BuildOutputContainerConfigSchema,
	BuildOutputRootConfigSchema,
	BuildOutputWorkerConfigSchema,
} from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	BUILD_OUTPUT_ROOT,
	getContainerConfigPath,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerConfigPath,
} from "../paths";
import { readBuildOutput } from "../read";
import {
	cleanBuildOutputDir,
	writeContainerConfig,
	writeAssets,
	writeRootConfig,
	writeWorkerConfig,
} from "../write";

const parsedWorkerConfig = WorkerConfigSchema.parse({
	name: "my-worker",
	compatibilityDate: "2026-06-01",
	entrypoint: "index.js",
});

const parsedSettingsConfig = SettingsSchema.parse({
	accountId: "1234567890",
	complianceRegion: "public",
});

const parsedStandardContainerConfig = BuildOutputContainerConfigSchema.parse({
	name: "api-container",
	image: { reference: "registry.example.com/api:latest" },
});

const parsedDurableObjectContainerConfig =
	BuildOutputContainerConfigSchema.parse({
		name: "session-container",
		schedulingPolicy: "durable-object",
		images: {
			default: { localReference: "session-container:latest" },
		},
	});

describe("writeRootConfig", () => {
	runInTempDir();

	function readRootConfigFile(root: string): unknown {
		return JSON.parse(fs.readFileSync(getRootConfigPath(root), "utf-8"));
	}

	it("writes the shared settings under settings", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig({
			root,
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: undefined },
		});

		expect(readRootConfigFile(root)).toEqual({
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: undefined },
		});
	});

	it("records build context alongside the shared settings", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeRootConfig({
			root,
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: "staging" },
		});

		expect(readRootConfigFile(root)).toEqual({
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: "staging" },
		});
	});

	it.for([
		["not given", undefined],
		["empty", {}],
		["all undefined", { accountId: undefined, complianceRegion: undefined }],
	] as const)(
		"omits settings when they are %s",
		async ([, settings], { expect }) => {
			const root = process.cwd();
			await writeRootConfig({
				root,
				settings,
				buildContext: { isPreview: true, mode: "production" },
			});

			const contents = readRootConfigFile(root);
			expect(contents).toEqual({
				buildContext: { isPreview: true, mode: "production" },
			});
			expect(contents).not.toHaveProperty("settings");
			expect(BuildOutputRootConfigSchema.parse(contents)).toEqual(contents);
		}
	);

	it("writes settings when only some are set", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig({
			root,
			settings: { accountId: "1234567890", complianceRegion: undefined },
			buildContext: { isPreview: false, mode: undefined },
		});

		expect(readRootConfigFile(root)).toEqual({
			settings: { accountId: "1234567890" },
			buildContext: { isPreview: false },
		});
	});

	it("writes the producer when given", async ({ expect }) => {
		const root = process.cwd();
		const producer = { name: "@cloudflare/vite-plugin", version: "2.3.0" };
		await writeRootConfig({
			root,
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: undefined },
			producer,
		});

		const contents = readRootConfigFile(root);
		expect(contents).toEqual({
			producer,
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: undefined },
		});
		expect(BuildOutputRootConfigSchema.parse(contents)).toEqual(contents);
	});

	it("omits the producer when not given", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig({
			root,
			buildContext: { isPreview: false, mode: undefined },
		});

		expect(readRootConfigFile(root)).not.toHaveProperty("producer");
	});

	it("writes under the v1 directory", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig({
			root,
			buildContext: { isPreview: false, mode: undefined },
		});

		expect(
			fs.existsSync(path.join(root, ".cloudflare/output/v1/config.json"))
		).toBe(true);
	});
});

describe("writeWorkerConfig", () => {
	runInTempDir();

	it("writes worker.config.json under default, stripping entrypoint and keeping the manifest", async ({
		expect,
	}) => {
		const root = process.cwd();
		const manifest = {
			type: "complete",
			mainModule: "index.js",
			modules: { "index.js": { type: "esm" } },
		} as const;

		await writeWorkerConfig({ root, config: parsedWorkerConfig, manifest });

		const contents = JSON.parse(
			fs.readFileSync(getWorkerConfigPath(root), "utf-8")
		);
		expect(contents).not.toHaveProperty("entrypoint");
		expect(contents.manifest).toEqual(manifest);
		// The written file is a valid Build Output Specification Worker config.
		expect(BuildOutputWorkerConfigSchema.parse(contents)).toEqual(contents);
	});

	it("omits the manifest field when no manifest is provided", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeWorkerConfig({ root, config: parsedWorkerConfig });

		const contents = JSON.parse(
			fs.readFileSync(getWorkerConfigPath(root), "utf-8")
		);
		expect(contents).not.toHaveProperty("manifest");
	});

	it("writes worker.config.json for a named Worker directory", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeWorkerConfig({
			root,
			config: parsedWorkerConfig,
			directoryName: "additional",
		});

		const contents = JSON.parse(
			fs.readFileSync(getWorkerConfigPath(root, "additional"), "utf-8")
		);
		expect(contents.name).toBe("my-worker");
	});
});

describe("writeContainerConfig", () => {
	runInTempDir();

	it("writes a standard Container config with a remote image reference", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeContainerConfig({
			root,
			config: parsedStandardContainerConfig,
			directoryName: parsedStandardContainerConfig.name,
		});

		const contents = JSON.parse(
			fs.readFileSync(getContainerConfigPath(root, "api-container"), "utf-8")
		);
		expect(contents).toEqual(parsedStandardContainerConfig);
		expect(BuildOutputContainerConfigSchema.parse(contents)).toEqual(contents);
	});

	it("writes a Durable Object Container config with a local image reference", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeContainerConfig({
			root,
			config: parsedDurableObjectContainerConfig,
			directoryName: parsedDurableObjectContainerConfig.name,
		});

		const contents = JSON.parse(
			fs.readFileSync(
				getContainerConfigPath(root, "session-container"),
				"utf-8"
			)
		);
		expect(contents).toEqual(parsedDurableObjectContainerConfig);
		expect(BuildOutputContainerConfigSchema.parse(contents)).toEqual(contents);
	});
});

describe("cleanBuildOutputDir", () => {
	runInTempDir();

	it("removes the build output directory", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig({
			root,
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: undefined },
		});
		const outputDir = path.join(root, BUILD_OUTPUT_ROOT);
		expect(fs.existsSync(outputDir)).toBe(true);

		await cleanBuildOutputDir(root);
		expect(fs.existsSync(outputDir)).toBe(false);
	});

	it("removes every version directory", async ({ expect }) => {
		const root = process.cwd();
		const staleVersionDir = path.join(root, BUILD_OUTPUT_ROOT, "v0");
		fs.mkdirSync(staleVersionDir, { recursive: true });
		await writeRootConfig({
			root,
			buildContext: { isPreview: false, mode: undefined },
		});

		await cleanBuildOutputDir(root);

		expect(fs.existsSync(staleVersionDir)).toBe(false);
		expect(fs.existsSync(getRootConfigPath(root))).toBe(false);
	});
});

describe("writeAssets", () => {
	runInTempDir();

	it("copies an asset directory into the build output", async ({ expect }) => {
		const root = process.cwd();
		const sourceDirectory = path.join(root, "public");
		fs.mkdirSync(sourceDirectory);
		fs.writeFileSync(path.join(sourceDirectory, "index.html"), "hello");

		await writeAssets({ root, sourceDirectory });

		expect(
			fs.readFileSync(path.join(getWorkerAssetsDir(root), "index.html"), "utf8")
		).toBe("hello");
	});

	it("dereferences symlinked files and directories", async ({ expect }) => {
		const root = process.cwd();
		const sourceDirectory = path.join(root, "public");
		const sourceNestedDirectory = path.join(sourceDirectory, "nested");
		fs.mkdirSync(sourceNestedDirectory, { recursive: true });
		fs.writeFileSync(path.join(sourceNestedDirectory, "index.html"), "hello");
		fs.symlinkSync(
			"nested/index.html",
			path.join(sourceDirectory, "index.html")
		);
		fs.symlinkSync("nested", path.join(sourceDirectory, "linked"), "dir");

		await writeRootConfig({
			root,
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: undefined },
		});
		await writeWorkerConfig({ root, config: parsedWorkerConfig });
		await writeAssets({ root, sourceDirectory });

		const output = await readBuildOutput(root);
		const assetsDir = getWorkerAssetsDir(root);
		expect(output.workers.default.assetsDir).toBe(assetsDir);
		expect(fs.lstatSync(path.join(assetsDir, "index.html")).isFile()).toBe(
			true
		);
		expect(fs.lstatSync(path.join(assetsDir, "linked")).isDirectory()).toBe(
			true
		);
		expect(
			fs.readFileSync(path.join(assetsDir, "linked/index.html"), "utf8")
		).toBe("hello");
	});

	it("omits .cloudflare when the project root contains the assets", async ({
		expect,
	}) => {
		const root = process.cwd();
		fs.writeFileSync(path.join(root, "index.html"), "hello");
		fs.mkdirSync(path.join(root, "nested"));
		fs.writeFileSync(path.join(root, "nested/linked.html"), "linked");
		fs.symlinkSync("nested", path.join(root, "linked"), "dir");
		await writeRootConfig({
			root,
			settings: parsedSettingsConfig,
			buildContext: { isPreview: false, mode: undefined },
		});

		await writeAssets({ root, sourceDirectory: root });

		const assetsDir = getWorkerAssetsDir(root);
		expect(fs.readFileSync(path.join(assetsDir, "index.html"), "utf8")).toBe(
			"hello"
		);
		expect(fs.lstatSync(path.join(assetsDir, "linked")).isDirectory()).toBe(
			true
		);
		expect(
			fs.readFileSync(path.join(assetsDir, "linked/linked.html"), "utf8")
		).toBe("linked");
		expect(fs.existsSync(path.join(assetsDir, ".cloudflare"))).toBe(false);
	});

	it("preserves files already generated in the build output", async ({
		expect,
	}) => {
		const root = process.cwd();
		fs.writeFileSync(path.join(root, "index.html"), "source");
		const assetsDir = getWorkerAssetsDir(root);
		fs.mkdirSync(assetsDir, { recursive: true });
		fs.writeFileSync(path.join(assetsDir, "index.html"), "generated");

		await writeAssets({ root, sourceDirectory: root });

		expect(fs.readFileSync(path.join(assetsDir, "index.html"), "utf8")).toBe(
			"generated"
		);
	});
});
