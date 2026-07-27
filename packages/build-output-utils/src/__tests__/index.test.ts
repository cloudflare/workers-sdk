import * as fs from "node:fs";
import * as path from "node:path";
import {
	InputWorkerSchema,
	OutputWorkerSchema,
	SettingsSchema,
} from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	BUILD_OUTPUT_ROOT,
	BUILD_OUTPUT_VERSION,
	cleanBuildOutputDir,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
	getWorkersDir,
	ROOT_CONFIG_FILENAME,
	WORKER_CONFIG_FILENAME,
	writeOutputWorkerConfig,
	writeRootOutputConfig,
} from "../index";

const WORKER_NAME = "my-worker";

const parsedWorkerConfig = InputWorkerSchema.parse({
	type: "worker",
	name: WORKER_NAME,
	compatibilityDate: "2026-06-01",
	entrypoint: "index.js",
});

const parsedSettingsConfig = SettingsSchema.parse({
	type: "settings",
	accountId: "1234567890",
	complianceRegion: "public",
});

describe("path constants", () => {
	it("expose the spec's version and root", ({ expect }) => {
		expect(BUILD_OUTPUT_VERSION).toBe("v0");
		expect(BUILD_OUTPUT_ROOT).toBe(".cloudflare/output");
		expect(ROOT_CONFIG_FILENAME).toBe("config.json");
		expect(WORKER_CONFIG_FILENAME).toBe("worker.config.json");
	});
});

describe("path resolvers", () => {
	const root = path.resolve("/project");
	const outputDir = path.join(root, ".cloudflare", "output", "v0");

	it("resolve the top-level config path", ({ expect }) => {
		expect(getRootConfigPath(root)).toBe(path.join(outputDir, "config.json"));
	});

	it("resolve the workers directory", ({ expect }) => {
		expect(getWorkersDir(root)).toBe(path.join(outputDir, "workers"));
	});

	it("resolve a Worker's config, bundle, and assets paths", ({ expect }) => {
		const workerDir = path.join(outputDir, "workers", WORKER_NAME);
		expect(getWorkerConfigPath(root, WORKER_NAME)).toBe(
			path.join(workerDir, "worker.config.json")
		);
		expect(getWorkerBundleDir(root, WORKER_NAME)).toBe(
			path.join(workerDir, "bundle")
		);
		expect(getWorkerAssetsDir(root, WORKER_NAME)).toBe(
			path.join(workerDir, "assets")
		);
	});
});

describe("writeRootOutputConfig", () => {
	runInTempDir();

	it("writes the top-level config.json with the shared settings", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeRootOutputConfig(root, parsedSettingsConfig);

		const contents = JSON.parse(
			fs.readFileSync(getRootConfigPath(root), "utf-8")
		);
		expect(contents).toEqual(parsedSettingsConfig);
	});
});

describe("writeOutputWorkerConfig", () => {
	runInTempDir();

	it("writes worker.config.json, stripping entrypoint and keeping the manifest", async ({
		expect,
	}) => {
		const root = process.cwd();
		const manifest = {
			mainModule: "index.js",
			modules: { "index.js": { type: "esm" as const } },
		};

		await writeOutputWorkerConfig(root, parsedWorkerConfig, manifest);

		const contents = JSON.parse(
			fs.readFileSync(getWorkerConfigPath(root, WORKER_NAME), "utf-8")
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
		await writeOutputWorkerConfig(root, parsedWorkerConfig);

		const contents = JSON.parse(
			fs.readFileSync(getWorkerConfigPath(root, WORKER_NAME), "utf-8")
		);
		expect(contents).not.toHaveProperty("manifest");
	});
});

describe("cleanBuildOutputDir", () => {
	runInTempDir();

	it("removes the build output directory", async ({ expect }) => {
		const root = process.cwd();
		await writeRootOutputConfig(root, parsedSettingsConfig);
		const outputDir = path.join(root, BUILD_OUTPUT_ROOT);
		expect(fs.existsSync(outputDir)).toBe(true);

		await cleanBuildOutputDir(root);
		expect(fs.existsSync(outputDir)).toBe(false);
	});
});
