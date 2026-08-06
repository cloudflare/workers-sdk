import * as fs from "node:fs";
import * as path from "node:path";
import {
	InputSettingsSchema,
	InputWorkerSchema,
	OutputWorkerSchema,
} from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	BUILD_OUTPUT_ROOT,
	getRootConfigPath,
	getWorkerConfigPath,
} from "../paths";
import {
	cleanBuildOutputDir,
	writeRootConfig,
	writeWorkerConfig,
} from "../write";

const parsedWorkerConfig = InputWorkerSchema.parse({
	type: "worker",
	name: "my-worker",
	compatibilityDate: "2026-06-01",
	entrypoint: "index.js",
});

const parsedSettingsConfig = InputSettingsSchema.parse({
	type: "settings",
	accountId: "1234567890",
	complianceRegion: "public",
});

describe("writeRootConfig", () => {
	runInTempDir();

	it("writes the top-level config.json with the shared settings", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeRootConfig(root, parsedSettingsConfig);

		const contents = JSON.parse(
			fs.readFileSync(getRootConfigPath(root), "utf-8")
		);
		expect(contents).toEqual(parsedSettingsConfig);
	});
});

describe("writeWorkerConfig", () => {
	runInTempDir();

	it("writes config.json, stripping entrypoint and keeping the manifest", async ({
		expect,
	}) => {
		const root = process.cwd();
		const manifest = {
			mainModule: "index.js",
			modules: { "index.js": { type: "esm" as const } },
		};

		await writeWorkerConfig(root, parsedWorkerConfig, manifest);

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
		await writeWorkerConfig(root, parsedWorkerConfig);

		const contents = JSON.parse(
			fs.readFileSync(getWorkerConfigPath(root), "utf-8")
		);
		expect(contents).not.toHaveProperty("manifest");
	});
});

describe("cleanBuildOutputDir", () => {
	runInTempDir();

	it("removes the build output directory", async ({ expect }) => {
		const root = process.cwd();
		await writeRootConfig(root, parsedSettingsConfig);
		const outputDir = path.join(root, BUILD_OUTPUT_ROOT);
		expect(fs.existsSync(outputDir)).toBe(true);

		await cleanBuildOutputDir(root);
		expect(fs.existsSync(outputDir)).toBe(false);
	});
});
