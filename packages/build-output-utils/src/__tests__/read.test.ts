import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
	InputSettingsSchema,
	InputWorkerSchema,
	OutputContainerSchema,
} from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it } from "vitest";
import { BuildOutputError } from "../errors";
import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	getContainerConfigPath,
	getContainerDir,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
	getWorkerDir,
} from "../paths";
import { readBuildOutput } from "../read";
import {
	writeContainerConfig,
	writeRootConfig,
	writeWorkerConfig,
} from "../write";
import type { BuildOutputWorker, BuildOutputWorkers } from "../read";
import type { ParsedOutputWorkerConfig } from "@cloudflare/config";

const completeManifest: ParsedOutputWorkerConfig["manifest"] = {
	type: "complete",
	mainModule: "index.js",
	modules: { "index.js": { type: "esm" } },
};

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

function inputWorkerConfig(name: string) {
	return InputWorkerSchema.parse({
		name,
		compatibilityDate: "2026-06-01",
		entrypoint: "index.js",
	});
}

function getWorker(
	workers: BuildOutputWorkers,
	directoryName: string
): BuildOutputWorker {
	const worker = workers[directoryName];
	if (worker === undefined) {
		throw new Error(`Expected Worker ${JSON.stringify(directoryName)}.`);
	}
	return worker;
}

async function writeBundleFiles(
	root: string,
	files: Record<string, string>
): Promise<void> {
	const bundleDir = getWorkerBundleDir(root);
	for (const [fileName, contents] of Object.entries(files)) {
		const filePath = path.join(bundleDir, fileName);
		await fsp.mkdir(path.dirname(filePath), { recursive: true });
		await fsp.writeFile(filePath, contents);
	}
}

/**
 * Seed a Worker into the Build Output Specification tree, optionally creating
 * the `bundle/` and `assets/` directories on disk.
 *
 * `hasBundle` controls whether the config is written with a manifest and
 * whether the `bundle/` directory is created. `bundleDir` can override just the
 * directory creation (defaulting to `hasBundle`), which is useful for
 * exercising the "manifest present but bundle directory missing" validation.
 */
async function seedWorker(
	root: string,
	{
		directoryName = DEFAULT_WORKER_DIRECTORY_NAME,
		name = "my-worker",
		hasBundle = true,
		bundleDir = hasBundle,
		assets = false,
	}: {
		directoryName?: string;
		name?: string;
		hasBundle?: boolean;
		bundleDir?: boolean;
		assets?: boolean;
	} = {}
) {
	await writeWorkerConfig({
		root,
		config: inputWorkerConfig(name),
		manifest: hasBundle ? completeManifest : undefined,
		directoryName,
	});
	if (bundleDir) {
		await fsp.mkdir(getWorkerBundleDir(root, directoryName), {
			recursive: true,
		});
	}
	if (assets) {
		await fsp.mkdir(getWorkerAssetsDir(root, directoryName), {
			recursive: true,
		});
	}
}

describe("readBuildOutput", () => {
	runInTempDir();
	beforeEach(async () => {
		await writeRootConfig(process.cwd(), parsedSettingsConfig, {
			isPreview: false,
			mode: undefined,
		});
	});

	it("reads the default Worker, keeping the manifest", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);

		const output = await readBuildOutput(root);
		const worker = output.workers.default;

		expect(output.version).toBe("v0");
		expect(output.root).toBe(root);
		expect(worker.configPath).toBe(getWorkerConfigPath(root));
		expect(worker.bundleDir).toBe(getWorkerBundleDir(root));
		expect(worker.assetsDir).toBeUndefined();

		expect(worker.config.name).toBe("my-worker");
		expect(worker.config.manifest).toEqual(completeManifest);
		expect(worker.config).not.toHaveProperty("entrypoint");
	});

	it("returns an absolute project root", async ({ expect }) => {
		await seedWorker(process.cwd());

		const output = await readBuildOutput(".");

		expect(output.root).toBe(process.cwd());
	});

	it("reads additional Workers keyed by directory name", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root, {
			directoryName: "additional-worker",
			name: "additional-worker",
		});
		await seedWorker(root);

		const { workers } = await readBuildOutput(root);
		const additionalWorker = getWorker(workers, "additional-worker");

		expect(Object.keys(workers)).toHaveLength(2);
		expect(Object.keys(workers)).toEqual(
			expect.arrayContaining(["default", "additional-worker"])
		);
		expect(additionalWorker.config.name).toBe("additional-worker");
		expect(additionalWorker.bundleDir).toBe(
			getWorkerBundleDir(root, "additional-worker")
		);
	});

	it("reads Containers", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeContainerConfig({
			root,
			config: parsedDurableObjectContainerConfig,
			directoryName: parsedDurableObjectContainerConfig.name,
		});
		await writeContainerConfig({
			root,
			config: parsedStandardContainerConfig,
			directoryName: parsedStandardContainerConfig.name,
		});

		const { containers } = await readBuildOutput(root);

		expect(containers).toHaveLength(2);
		expect(containers).toEqual(
			expect.arrayContaining([
				{
					configPath: getContainerConfigPath(root, "api-container"),
					config: parsedStandardContainerConfig,
				},
				{
					configPath: getContainerConfigPath(root, "session-container"),
					config: parsedDurableObjectContainerConfig,
				},
			])
		);
	});

	it("returns no Containers when the Containers directory is absent", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);

		const { containers } = await readBuildOutput(root);

		expect(containers).toEqual([]);
	});

	it("requires the default Worker when Containers are present", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeContainerConfig({
			root,
			config: parsedStandardContainerConfig,
			directoryName: parsedStandardContainerConfig.name,
		});

		await expect(readBuildOutput(root)).rejects.toThrow(
			/no Worker config found/
		);
	});

	it("throws when a Container config is missing", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await fsp.mkdir(getContainerDir(root, "api"), { recursive: true });

		await expect(readBuildOutput(root)).rejects.toThrow(BuildOutputError);
		await expect(readBuildOutput(root)).rejects.toThrow(
			/no Container config found/
		);
	});

	it("throws when a Container config is not valid JSON", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await fsp.mkdir(getContainerDir(root, "api"), { recursive: true });
		await fsp.writeFile(getContainerConfigPath(root, "api"), "{ not json");

		await expect(readBuildOutput(root)).rejects.toThrow(/could not parse JSON/);
	});

	it("throws when a Container config does not match its schema", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await fsp.mkdir(getContainerDir(root, "api"), { recursive: true });
		await fsp.writeFile(
			getContainerConfigPath(root, "api"),
			JSON.stringify({ name: "api" })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(
			/invalid Container config/
		);
	});

	it("resolves a partial manifest from bundle files and explicit overrides", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeWorkerConfig({
			root,
			config: inputWorkerConfig("my-worker"),
			manifest: {
				type: "partial",
				mainModule: "index.js",
				modules: {
					"chunks/worker.mjs": { type: "cjs" },
					"data.txt": { type: "text" },
				},
			},
		});
		await writeBundleFiles(root, {
			"index.js": "module.exports = {};",
			"chunks/worker.mjs": "export default {};",
			"chunks/worker.mjs.map": "{}",
			"data.txt": "data",
			"ignored.json": "{}",
		});

		const { workers } = await readBuildOutput(root);
		const { manifest: resolvedManifest } = workers.default.config;

		expect(resolvedManifest).toEqual({
			type: "complete",
			mainModule: "index.js",
			modules: {
				"chunks/worker.mjs": { type: "cjs" },
				"chunks/worker.mjs.map": { type: "sourcemap" },
				"data.txt": { type: "text" },
				"index.js": { type: "esm" },
			},
		});
	});

	it("does not scan bundle files for a complete manifest", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeBundleFiles(root, {
			"index.js": "export default {};",
			"unlisted.js": "export default {};",
		});

		const { workers } = await readBuildOutput(root);
		const { manifest: resolvedManifest } = workers.default.config;

		expect(resolvedManifest).toEqual(completeManifest);
	});

	it("throws when a partial manifest's main module cannot be resolved", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeWorkerConfig({
			root,
			config: inputWorkerConfig("my-worker"),
			manifest: {
				type: "partial",
				mainModule: "missing.js",
				modules: {},
			},
		});

		await expect(readBuildOutput(root)).rejects.toThrow(
			/partial manifest .* has main module "missing\.js", but it was not found as an ES module/
		);
	});

	it("throws when a partial manifest's main module is a source map", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeWorkerConfig({
			root,
			config: inputWorkerConfig("my-worker"),
			manifest: {
				type: "partial",
				mainModule: "index.js.map",
				modules: {},
			},
		});
		await writeBundleFiles(root, { "index.js.map": "{}" });

		await expect(readBuildOutput(root)).rejects.toThrow(
			/partial manifest .* has main module "index\.js\.map", but it was not found as an ES module/
		);
	});

	it("resolves the assets directory when present and leaves bundle undefined for assets-only Workers", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root, { hasBundle: false, assets: true });

		const { workers } = await readBuildOutput(root);
		const worker = workers.default;

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
		await fsp.mkdir(getWorkerDir(root), { recursive: true });

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

	it("throws when the Worker config does not match its schema", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await fsp.writeFile(getWorkerConfigPath(root), JSON.stringify({}));

		await expect(readBuildOutput(root)).rejects.toThrow(
			/invalid Worker config/
		);
	});

	it("returns the root config", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeRootConfig(root, parsedSettingsConfig, {
			isPreview: false,
			mode: undefined,
		});

		const { rootConfig } = await readBuildOutput(root);

		expect(rootConfig).toEqual({
			...parsedSettingsConfig,
			buildContext: { isPreview: false },
		});
	});

	it("throws when the root config is absent", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		await fsp.rm(getRootConfigPath(root));

		await expect(readBuildOutput(root)).rejects.toThrow(/no root config found/);
	});

	it("returns the build context recorded in the root config", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeRootConfig(root, parsedSettingsConfig, {
			isPreview: true,
			mode: "staging",
		});

		const { rootConfig } = await readBuildOutput(root);

		expect(rootConfig).toEqual({
			...parsedSettingsConfig,
			buildContext: { isPreview: true, mode: "staging" },
		});
	});

	it("returns the build context when no mode was selected", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		await writeRootConfig(root, parsedSettingsConfig, {
			isPreview: false,
			mode: undefined,
		});

		const { rootConfig } = await readBuildOutput(root);

		expect(rootConfig.buildContext).toEqual({ isPreview: false });
	});

	it("throws when the recorded mode is not a string", async ({ expect }) => {
		const root = process.cwd();
		await seedWorker(root);
		const configPath = getRootConfigPath(root);
		await fsp.mkdir(path.dirname(configPath), { recursive: true });
		await fsp.writeFile(
			configPath,
			JSON.stringify({ buildContext: { isPreview: false, mode: 123 } })
		);

		await expect(readBuildOutput(root)).rejects.toThrow(/invalid root config/);
	});

	it("throws when the root config does not match its schema", async ({
		expect,
	}) => {
		const root = process.cwd();
		await seedWorker(root);
		const configPath = getRootConfigPath(root);
		await fsp.mkdir(path.dirname(configPath), { recursive: true });
		await fsp.writeFile(configPath, JSON.stringify({ nope: 1 }));

		await expect(readBuildOutput(root)).rejects.toThrow(/invalid root config/);
	});

	it("reads the root config before Worker configs", async ({ expect }) => {
		const root = process.cwd();
		await fsp.mkdir(getWorkerDir(root), { recursive: true });
		await fsp.writeFile(getWorkerConfigPath(root), "{ not json");
		const configPath = getRootConfigPath(root);
		await fsp.writeFile(configPath, JSON.stringify({ nope: 1 }));

		await expect(readBuildOutput(root)).rejects.toThrow(/invalid root config/);
	});
});
