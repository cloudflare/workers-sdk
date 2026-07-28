import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { InputWorkerSchema, SettingsSchema } from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { BuildOutputError } from "../errors";
import {
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
} from "../paths";
import { readBuildOutput } from "../read";
import { writeRootConfig, writeWorkerConfig } from "../write";
import type { ParsedOutputWorkerConfig } from "@cloudflare/config";

const manifest: ParsedOutputWorkerConfig["manifest"] = {
	mainModule: "index.js",
	modules: { "index.js": { type: "esm" } },
};

const parsedSettingsConfig = SettingsSchema.parse({
	type: "settings",
	accountId: "1234567890",
	complianceRegion: "public",
});

function inputWorkerConfig(name: string) {
	return InputWorkerSchema.parse({
		type: "worker",
		name,
		compatibilityDate: "2026-06-01",
		entrypoint: "index.js",
	});
}

/**
 * Seed the single `default` Worker into the Build Output Specification tree,
 * optionally creating the `bundle/` and `assets/` directories on disk.
 */
async function seedWorker(
	root: string,
	{
		name = "my-worker",
		bundle = true,
		assets = false,
	}: { name?: string; bundle?: boolean; assets?: boolean } = {}
) {
	await writeWorkerConfig(
		root,
		inputWorkerConfig(name),
		bundle ? manifest : undefined
	);
	if (bundle) {
		await fsp.mkdir(getWorkerBundleDir(root), { recursive: true });
	}
	if (assets) {
		await fsp.mkdir(getWorkerAssetsDir(root), { recursive: true });
	}
}

describe("readBuildOutput", () => {
	runInTempDir();

	it("reads and validates the default Worker, keeping the manifest", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);

		const output = await readBuildOutput(root);

		expect(output.version).toBe("v0");
		expect(output.root).toBe(root);
		expect(output.worker.configPath).toBe(getWorkerConfigPath(root));
		expect(output.worker.bundleDir).toBe(getWorkerBundleDir(root));
		expect(output.worker.assetsDir).toBeUndefined();

		expect(output.worker.config.name).toBe("my-worker");
		expect(output.worker.config.manifest).toEqual(manifest);
		expect(output.worker.config).not.toHaveProperty("entrypoint");
	});

	it("resolves the assets directory when present and leaves bundle undefined for assets-only Workers", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root, { bundle: false, assets: true });

		const { worker } = await readBuildOutput(root);

		expect(worker.bundleDir).toBeUndefined();
		expect(worker.assetsDir).toBe(getWorkerAssetsDir(root));
	});

	it("throws when the Worker config is missing", async ({ expect }) => {
		const root = process.cwd();

		await expect(readBuildOutput(root)).rejects.toThrow(BuildOutputError);
		await expect(readBuildOutput(root)).rejects.toThrow(
			/No Worker config found/
		);
	});

	it("throws when the config is not valid JSON", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await fsp.writeFile(getWorkerConfigPath(root), "{ not json");

		await expect(readBuildOutput(root)).rejects.toThrow(/could not parse JSON/);
	});

	it("throws when the config fails schema validation", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await fsp.writeFile(
			getWorkerConfigPath(root),
			JSON.stringify({ type: "worker" })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(
			/invalid Worker config/
		);
	});

	it("returns the top-level settings when present", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeRootConfig(root, parsedSettingsConfig);

		const { settings } = await readBuildOutput(root);

		expect(settings).toEqual(parsedSettingsConfig);
	});

	it("returns undefined settings when the top-level config is absent", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);

		const { settings } = await readBuildOutput(root);

		expect(settings).toBeUndefined();
	});

	it("throws when the top-level config fails schema validation", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		const configPath = getRootConfigPath(root);
		await fsp.mkdir(path.dirname(configPath), { recursive: true });
		await fsp.writeFile(
			configPath,
			JSON.stringify({ type: "settings", nope: 1 })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(/invalid root config/);
	});

	it("reads the top-level settings before the Worker config", async ({
		expect,
	}) => {
		const root = process.cwd();
		// Invalid settings plus a missing Worker config: the settings error
		// surfaces first because settings are read first.
		const configPath = getRootConfigPath(root);
		await fsp.mkdir(path.dirname(configPath), { recursive: true });
		await fsp.writeFile(
			configPath,
			JSON.stringify({ type: "settings", nope: 1 })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(/invalid root config/);
	});
});
