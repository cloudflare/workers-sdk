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
	getSettingsConfigPath,
	getWorkerConfigPath,
} from "../paths";
import {
	cleanBuildOutputDir,
	writeSettingsConfig,
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

describe("writeSettingsConfig", () => {
	runInTempDir();

	it("writes the top-level config.json with the shared settings", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeSettingsConfig(root, parsedSettingsConfig);

		const contents = JSON.parse(
			fs.readFileSync(getSettingsConfigPath(root), "utf-8")
		);
		expect(contents).toEqual(parsedSettingsConfig);
	});

	it("records the mode alongside the shared settings", async ({ expect }) => {
		const root = process.cwd();
		await writeSettingsConfig(root, parsedSettingsConfig, "staging");

		const contents = JSON.parse(
			fs.readFileSync(getSettingsConfigPath(root), "utf-8")
		);
		expect(contents).toEqual({ ...parsedSettingsConfig, mode: "staging" });
	});

	it("omits the mode key when no mode was selected", async ({ expect }) => {
		const root = process.cwd();
		await writeSettingsConfig(root, parsedSettingsConfig, undefined);

		const contents = JSON.parse(
			fs.readFileSync(getSettingsConfigPath(root), "utf-8")
		);
		expect(contents).not.toHaveProperty("mode");
	});

	it("writes a config with just the type when there are no settings and no mode", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeSettingsConfig(root, undefined);

		const contents = JSON.parse(
			fs.readFileSync(getSettingsConfigPath(root), "utf-8")
		);
		expect(contents).toEqual({ type: "settings" });
	});

	it("writes the mode when there are no settings", async ({ expect }) => {
		const root = process.cwd();
		await writeSettingsConfig(root, undefined, "production");

		const contents = JSON.parse(
			fs.readFileSync(getSettingsConfigPath(root), "utf-8")
		);
		expect(contents).toEqual({ type: "settings", mode: "production" });
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
		await writeSettingsConfig(root, parsedSettingsConfig);
		const outputDir = path.join(root, BUILD_OUTPUT_ROOT);
		expect(fs.existsSync(outputDir)).toBe(true);

		await cleanBuildOutputDir(root);
		expect(fs.existsSync(outputDir)).toBe(false);
	});
});
