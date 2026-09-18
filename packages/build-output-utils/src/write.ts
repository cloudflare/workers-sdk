import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import {
	DEFAULT_WORKER_DIRECTORY_NAME,
	getBuildOutputDir,
	getContainerConfigPath,
	getContainerDir,
	getRootConfigPath,
	getWorkerConfigPath,
	getWorkerDir,
} from "./paths";
import type {
	ParsedInputSettingsConfig,
	ParsedInputWorkerConfig,
	ParsedOutputContainerConfig,
	ParsedOutputRootConfig,
	ParsedOutputWorkerConfig,
	ConfigContext,
} from "@cloudflare/config";

/**
 * Clean the build output directory.
 */
export async function cleanBuildOutputDir(root: string): Promise<void> {
	await removeDir(getBuildOutputDir(root));
}

export interface WriteWorkerConfigOptions {
	root: string;
	config: ParsedInputWorkerConfig;
	manifest?: ParsedOutputWorkerConfig["manifest"];
	directoryName?: string;
}

/**
 * Write an output Worker `worker.config.json` to the Build Output Specification
 * tree.
 *
 * - Workers mode: `manifest` is provided (bundle/ present on disk).
 * - Assets-only mode: `manifest` is omitted (no bundle/ directory).
 */
export async function writeWorkerConfig({
	root,
	config,
	manifest,
	directoryName = DEFAULT_WORKER_DIRECTORY_NAME,
}: WriteWorkerConfigOptions): Promise<void> {
	const { entrypoint: _entrypoint, ...rest } = config;
	const outputConfig: ParsedOutputWorkerConfig = { ...rest, manifest };
	await fsp.mkdir(getWorkerDir(root, directoryName), { recursive: true });
	await fsp.writeFile(
		getWorkerConfigPath(root, directoryName),
		JSON.stringify(outputConfig)
	);
}

export interface WriteContainerConfigOptions {
	root: string;
	config: ParsedOutputContainerConfig;
	directoryName: string;
}

/**
 * Write an output Container `container.config.json` to the Build Output
 * Specification tree.
 *
 * Local Dockerfiles must already have been built and represented by a
 * `localReference` in the output config.
 */
export async function writeContainerConfig({
	root,
	config,
	directoryName,
}: WriteContainerConfigOptions): Promise<void> {
	await fsp.mkdir(getContainerDir(root, directoryName), {
		recursive: true,
	});
	await fsp.writeFile(
		getContainerConfigPath(root, directoryName),
		JSON.stringify(config)
	);
}

/**
 * Write the top-level `config.json` to the Build Output Specification tree.
 *
 * Holds the settings declared at the top level of `cloudflare.config.ts` and
 * build context supplied at build time.
 */
export async function writeRootConfig(
	root: string,
	settings: ParsedInputSettingsConfig | undefined,
	buildContext: ConfigContext
): Promise<void> {
	const outputConfig: ParsedOutputRootConfig = {
		...settings,
		buildContext,
	};
	const configPath = getRootConfigPath(root);
	await fsp.mkdir(path.dirname(configPath), { recursive: true });
	await fsp.writeFile(configPath, JSON.stringify(outputConfig));
}
