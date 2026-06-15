import assert from "node:assert";
import * as fs from "node:fs";
import { normalizeAndValidateConfig } from "@cloudflare/workers-utils";
import {
	getWorkersDir,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
	WORKER_CONFIG_FILENAME,
} from "./build-output";
import type { ModuleType } from "@cloudflare/config";
import type { Unstable_Config } from "wrangler";

export interface Bundle {
	rootPath: string;
	mainModule: string;
	modules: Record<string, { type: ModuleType }>;
}

export interface BuildOutputPreviewWorker {
	source: "build-output";
	config: Unstable_Config;
	bundle: Bundle | undefined;
}

/**
 * Read the Build Output API at `<root>/.cloudflare/output/v0/workers/`
 * and reconstruct a `BuildOutputPreviewWorker` for each Worker
 */
export async function readBuildOutputWorkers(
	root: string
): Promise<BuildOutputPreviewWorker[]> {
	const workersDir = getWorkersDir(root);

	if (!fs.existsSync(workersDir)) {
		throw new Error(`No Build Output API tree found at ${workersDir}.`);
	}

	const workerNames = fs
		.readdirSync(workersDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	if (workerNames.length === 0) {
		throw new Error(
			`Build Output API tree at ${workersDir} contains no Worker directories.`
		);
	}

	const { OutputWorkerSchema, convertToWranglerConfig } =
		await import("@cloudflare/config");

	return workerNames.map((workerName) => {
		const configPath = getWorkerConfigPath(root, workerName);
		assert(
			fs.existsSync(configPath),
			`Build Output API: missing \`${WORKER_CONFIG_FILENAME}\` for Worker "${workerName}" at ${configPath}.`
		);
		const outputConfig = OutputWorkerSchema.parse(
			JSON.parse(fs.readFileSync(configPath, "utf-8"))
		);
		const { manifest, ...inputShape } = outputConfig;
		const rawConfig = convertToWranglerConfig(inputShape);

		const { config, diagnostics } = normalizeAndValidateConfig(
			rawConfig,
			undefined,
			undefined,
			{},
			true
		);

		if (diagnostics.hasWarnings()) {
			console.warn(diagnostics.renderWarnings());
		}
		if (diagnostics.hasErrors()) {
			throw new Error(diagnostics.renderErrors());
		}

		const bundleDir = getWorkerBundleDir(root, workerName);
		const assetsDir = getWorkerAssetsDir(root, workerName);

		if (fs.existsSync(assetsDir)) {
			config.assets = {
				...(config.assets ?? {}),
				directory: assetsDir,
			};
		}

		let bundle: Bundle | undefined;
		if (manifest) {
			config.main = manifest.mainModule;
			bundle = {
				rootPath: bundleDir,
				mainModule: manifest.mainModule,
				modules: manifest.modules,
			};
		}

		return {
			source: "build-output",
			config,
			bundle,
		};
	});
}
