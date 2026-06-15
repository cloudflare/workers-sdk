import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import type {
	ModuleType,
	ParsedInputWorkerConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

/**
 * Initial draft version of the Build Output API.
 *
 * Will move to `v1` when the spec stabilises.
 */
const BUILD_OUTPUT_VERSION = "v0";

/**
 * Project-relative root.
 */
const BUILD_OUTPUT_ROOT = ".cloudflare/output";

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
 * Clean the build output directory
 *
 * Called once at the start of each build
 */
export function cleanBuildOutputDir(root: string): void {
	removeDirSync(getBuildOutputDir(root));
}

/**
 * Absolute path to the workers output directory
 */
export function getWorkersDir(root: string): string {
	return path.join(getBuildOutputDir(root), BUILD_OUTPUT_VERSION, "workers");
}

/**
 * Absolute path to `worker.config.json` for a given Worker.
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
 * Map a bundle filename to its declared module type.
 */
export function detectModuleType(filename: string): ModuleType {
	const ext = path.extname(filename).toLowerCase();

	switch (ext) {
		case ".js":
		case ".mjs":
			return "esm";
		case ".wasm":
			return "wasm";
		case ".bin":
			return "data";
		case ".txt":
		case ".html":
		case ".sql":
			return "text";
		case ".json":
			return "json";
		case ".map":
			return "sourcemap";
		default:
			return "data";
	}
}

/**
 * Write the output `worker.config.json` for a given Worker to the Build
 * Output API tree.
 *
 * - Workers mode: `manifest` is provided (bundle/ present on disk).
 * - Assets-only mode: `manifest` is omitted (no bundle/ directory).
 */
export function writeOutputWorkerConfig(
	root: string,
	parsedConfig: ParsedInputWorkerConfig,
	manifest?: ParsedOutputWorkerConfig["manifest"]
): void {
	const { entrypoint: _entrypoint, ...rest } = parsedConfig;
	const outputConfig: ParsedOutputWorkerConfig = { ...rest, manifest };
	const workerOutputDir = path.join(getWorkersDir(root), outputConfig.name);
	fs.mkdirSync(workerOutputDir, { recursive: true });
	const configPath = getWorkerConfigPath(root, outputConfig.name);
	fs.writeFileSync(configPath, JSON.stringify(outputConfig));
}
