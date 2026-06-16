import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import type {
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "./schema";

/**
 * Initial draft version of the Build Output API.
 *
 * Will move to `v1` when the spec stabilises.
 */
export const BUILD_OUTPUT_VERSION = "v0";

/**
 * Project-relative root.
 */
export const BUILD_OUTPUT_ROOT = ".cloudflare/output";

/**
 * Filename of the per-Worker config.
 */
export const WORKER_CONFIG_FILENAME = "worker.config.json";

/**
 * Absolute path to the Build Output API root for the current project.
 */
function getBuildOutputDir(root: string): string {
	return path.resolve(root, BUILD_OUTPUT_ROOT);
}

/**
 * Clean the build output directory.
 */
export async function cleanBuildOutputDir(root: string): Promise<void> {
	await removeDir(getBuildOutputDir(root));
}

/**
 * Absolute path to the Workers output directory.
 */
export function getWorkersDir(root: string): string {
	return path.join(getBuildOutputDir(root), BUILD_OUTPUT_VERSION, "workers");
}

/**
 * Absolute path to the config file for a given Worker.
 */
export function getWorkerConfigPath(root: string, workerName: string): string {
	return path.join(getWorkersDir(root), workerName, WORKER_CONFIG_FILENAME);
}

/**
 * Absolute path to the bundle directory for a given Worker.
 */
export function getWorkerBundleDir(root: string, workerName: string): string {
	return path.join(getWorkersDir(root), workerName, "bundle");
}

/**
 * Absolute path to the assets directory for a given Worker.
 */
export function getWorkerAssetsDir(root: string, workerName: string): string {
	return path.join(getWorkersDir(root), workerName, "assets");
}

/**
 * Write the output `worker.config.json` for a given Worker to the Build
 * Output API tree.
 *
 * - Workers mode: `manifest` is provided (bundle/ present on disk).
 * - Assets-only mode: `manifest` is omitted (no bundle/ directory).
 */
export async function writeOutputWorkerConfig(
	root: string,
	parsedConfig: ParsedInputWorkerConfig,
	manifest?: ParsedOutputWorkerConfig["manifest"]
): Promise<void> {
	const { entrypoint: _entrypoint, ...rest } = parsedConfig;
	const outputConfig: ParsedOutputWorkerConfig = { ...rest, manifest };
	const workerOutputDir = path.join(getWorkersDir(root), outputConfig.name);
	await fsp.mkdir(workerOutputDir, { recursive: true });
	const configPath = getWorkerConfigPath(root, outputConfig.name);
	await fsp.writeFile(configPath, JSON.stringify(outputConfig));
}
