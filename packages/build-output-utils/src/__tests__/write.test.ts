import * as fs from "node:fs";
import * as path from "node:path";
import {
	InputSettingsSchema,
	InputWorkerSchema,
	OutputContainerSchema,
	OutputWorkerSchema,
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
import {
	cleanBuildOutputDir,
	writeContainerConfig,
	writeAssets,
	writeRootConfig,
	writeWorkerConfig,
} from "../write";

const parsedWorkerConfig = InputWorkerSchema.parse({
	name: "my-worker",
	compatibilityDate: "2026-06-01",
	entrypoint: "index.js",
});

const parsedSettingsConfig = InputSettingsSchema.parse({
	accountId: "1234567890",
	complianceRegion: "public",
});

const parsedStandardContainerConfig = OutputContainerSchema.parse({
	name: "api-container",
	image: { reference: "registry.example.com/api:latest" },
});

const parsedDurableObjectContainerConfig = OutputContainerSchema.parse({
	name: "session-container",
	schedulingPolicy: "durable-object",
	images: {
		default: { localReference: "session-container:latest" },
	},
});

describe("writeRootConfig", () => {
	runInTempDir();

	it("writes the root config.json with the shared settings", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeRootConfig(root, parsedSettingsConfig, {
			isPreview: false,
			mode: undefined,
		});

		const contents = JSON.parse(
			fs.readFileSync(getRootConfigPath(root), "utf-8")
		);
		expect(contents).toEqual({
			...parsedSettingsConfig,
			buildContext: { isPreview: false },
		});
	});

	it("records build context alongside the shared settings", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeRootConfig(root, parsedSettingsConfig, {
			isPreview: false,
			mode: "staging",
		});

		const contents = JSON.parse(
			fs.readFileSync(getRootConfigPath(root), "utf-8")
		);
		expect(contents).toEqual({
			...parsedSettingsConfig,
			buildContext: { isPreview: false, mode: "staging" },
		});
	});

	it("writes only build context when there are no settings or mode", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeRootConfig(root, undefined, {
			isPreview: false,
			mode: undefined,
		});

		const contents = JSON.parse(
			fs.readFileSync(getRootConfigPath(root), "utf-8")
		);
		expect(contents).toEqual({ buildContext: { isPreview: false } });
	});

	it("writes build context when there are no settings", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig(root, undefined, {
			isPreview: true,
			mode: "production",
		});

		const contents = JSON.parse(
			fs.readFileSync(getRootConfigPath(root), "utf-8")
		);
		expect(contents).toEqual({
			buildContext: { isPreview: true, mode: "production" },
		});
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
		expect(OutputWorkerSchema.parse(contents)).toEqual(contents);
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
		expect(OutputContainerSchema.parse(contents)).toEqual(contents);
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
		expect(OutputContainerSchema.parse(contents)).toEqual(contents);
	});
});

describe("cleanBuildOutputDir", () => {
	runInTempDir();

	it("removes the build output directory", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig(root, parsedSettingsConfig, {
			isPreview: false,
			mode: undefined,
		});
		const outputDir = path.join(root, BUILD_OUTPUT_ROOT);
		expect(fs.existsSync(outputDir)).toBe(true);

		await cleanBuildOutputDir(root);
		expect(fs.existsSync(outputDir)).toBe(false);
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

	it("omits .cloudflare when the project root contains the assets", async ({
		expect,
	}) => {
		const root = process.cwd();
		fs.writeFileSync(path.join(root, "index.html"), "hello");
		await writeRootConfig(root, parsedSettingsConfig, {
			isPreview: false,
			mode: undefined,
		});

		await writeAssets({ root, sourceDirectory: root });

		const assetsDir = getWorkerAssetsDir(root);
		expect(fs.readFileSync(path.join(assetsDir, "index.html"), "utf8")).toBe(
			"hello"
		);
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
