import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import {
	getBuildOutputDir,
	getRootConfigPath,
	getWorkerConfigPath,
	getWorkerDir,
} from "./paths";
import type {
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
	ParsedSettingsConfig,
} from "@cloudflare/config";

/**
 * Clean the build output directory.
 */
export async function cleanBuildOutputDir(root: string): Promise<void> {
	await removeDir(getBuildOutputDir(root));
}

/**
 * Write the output Worker `config.json` to the Build Output Specification
 * tree (`workers/default/`).
 *
 * - Workers mode: `manifest` is provided (bundle/ present on disk).
 * - Assets-only mode: `manifest` is omitted (no bundle/ directory).
 */
export async function writeWorkerConfig(
	root: string,
	parsedConfig: ParsedInputWorkerConfig,
	manifest?: ParsedOutputWorkerConfig["manifest"]
): Promise<void> {
	const { entrypoint: _entrypoint, ...rest } = parsedConfig;
	const outputConfig: ParsedOutputWorkerConfig = { ...rest, manifest };
	await fsp.mkdir(getWorkerDir(root), { recursive: true });
	await fsp.writeFile(getWorkerConfigPath(root), JSON.stringify(outputConfig));
}

/**
 * Write the top-level `config.json` holding shared settings to the Build
 * Output Specification tree.
 */
export async function writeRootConfig(
	root: string,
	settings: ParsedSettingsConfig
): Promise<void> {
	const configPath = getRootConfigPath(root);
	await fsp.mkdir(path.dirname(configPath), { recursive: true });
	await fsp.writeFile(configPath, JSON.stringify(settings));
}
