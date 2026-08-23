import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { InputSettingsSchema, InputWorkerSchema } from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { BuildOutputError } from "../errors";
import {
	getSettingsConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
} from "../paths";
import { readBuildOutput } from "../read";
import { writeSettingsConfig, writeWorkerConfig } from "../write";
import type { ParsedOutputWorkerConfig } from "@cloudflare/config";

const manifest: ParsedOutputWorkerConfig["manifest"] = {
	mainModule: "index.js",
	modules: { "index.js": { type: "esm" } },
};

const parsedSettingsConfig = InputSettingsSchema.parse({
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
 *
 * `hasBundle` controls whether the config is written with a manifest and
 * whether the `bundle/` directory is created. `bundleDir` can override just the
 * directory creation (defaulting to `hasBundle`), which is useful for
 * exercising the "manifest present but bundle directory missing" validation.
 */
async function seedWorker(
	root: string,
	{
		name = "my-worker",
		hasBundle = true,
		bundleDir = hasBundle,
		assets = false,
	}: {
		name?: string;
		hasBundle?: boolean;
		bundleDir?: boolean;
		assets?: boolean;
	} = {}
) {
	await writeWorkerConfig(
		root,
		inputWorkerConfig(name),
		hasBundle ? manifest : undefined
	);
	if (bundleDir) {
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
		expect(output.workers[0].configPath).toBe(getWorkerConfigPath(root));
		expect(output.workers[0].bundleDir).toBe(getWorkerBundleDir(root));
		expect(output.workers[0].assetsDir).toBeUndefined();

		expect(output.workers[0].config.name).toBe("my-worker");
		expect(output.workers[0].config.manifest).toEqual(manifest);
		expect(output.workers[0].config).not.toHaveProperty("entrypoint");
	});

	it("resolves the assets directory when present and leaves bundle undefined for assets-only Workers", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root, { hasBundle: false, assets: true });

		const {
			workers: [worker],
		} = await readBuildOutput(root);

		expect(worker.bundleDir).toBeUndefined();
		expect(worker.assetsDir).toBe(getWorkerAssetsDir(root));
	});

	it("throws when the config has a manifest but no bundle directory", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root, { hasBundle: true, bundleDir: false });

		await expect(readBuildOutput(root)).rejects.toThrow(BuildOutputError);
		await expect(readBuildOutput(root)).rejects.toThrow(
			/contains a manifest, but no bundle directory exists/
		);
	});

	it("throws when the Worker has neither a bundle nor an assets directory", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root, { hasBundle: false, assets: false });

		await expect(readBuildOutput(root)).rejects.toThrow(BuildOutputError);
		await expect(readBuildOutput(root)).rejects.toThrow(
			/has neither a bundle directory .* nor an assets directory/
		);
	});

	it("throws when the Worker config is missing", async ({ expect }) => {
		const root = process.cwd();

		await expect(readBuildOutput(root)).rejects.toThrow(BuildOutputError);
		await expect(readBuildOutput(root)).rejects.toThrow(
			/no Worker config found/
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
		await writeSettingsConfig(root, parsedSettingsConfig);

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

	it("returns the mode recorded in the top-level config", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeSettingsConfig(root, parsedSettingsConfig, "staging");

		const { settings } = await readBuildOutput(root);

		// The settings are returned whole, so `mode` sits alongside the fields
		// the user declared.
		expect(settings).toEqual({ ...parsedSettingsConfig, mode: "staging" });
	});

	it("returns an undefined mode when the top-level config records none", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeSettingsConfig(root, parsedSettingsConfig);

		const { settings } = await readBuildOutput(root);

		expect(settings?.mode).toBeUndefined();
	});

	it("returns an undefined mode when the top-level config is absent", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);

		const { settings } = await readBuildOutput(root);

		expect(settings?.mode).toBeUndefined();
	});

	it("throws when the recorded mode is not a string", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		const configPath = getSettingsConfigPath(root);
		await fsp.mkdir(path.dirname(configPath), { recursive: true });
		await fsp.writeFile(
			configPath,
			JSON.stringify({ type: "settings", mode: 123 })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(
			/invalid settings config/
		);
	});

	it("throws when the top-level config fails schema validation", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		const configPath = getSettingsConfigPath(root);
		await fsp.mkdir(path.dirname(configPath), { recursive: true });
		await fsp.writeFile(
			configPath,
			JSON.stringify({ type: "settings", nope: 1 })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(
			/invalid settings config/
		);
	});

	it("reads the top-level settings before the Worker config", async ({
		expect,
	}) => {
		const root = process.cwd();
		// Invalid settings plus a missing Worker config: the settings error
		// surfaces first because settings are read first.
		const configPath = getSettingsConfigPath(root);
		await fsp.mkdir(path.dirname(configPath), { recursive: true });
		await fsp.writeFile(
			configPath,
			JSON.stringify({ type: "settings", nope: 1 })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(
			/invalid settings config/
		);
	});
});
