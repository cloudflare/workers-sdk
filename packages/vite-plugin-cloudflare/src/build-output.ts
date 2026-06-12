import * as fs from "node:fs";
import * as path from "node:path";
import type { ParsedConfig } from "@cloudflare/config";

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
 * Absolute path to the workers output directory
 */
export function getWorkersDir(root: string): string {
	return path.resolve(root, BUILD_OUTPUT_ROOT, BUILD_OUTPUT_VERSION, "workers");
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
 * Module types.
 *
 * `esm`, `wasm`, `data`, `text`, `sourcemap` are produced by the Vite plugin today.
 * `cjs`, `python`, `pythonRequirement`, `json` are reserved for future use.
 */
export type ModuleType =
	| "esm"
	| "cjs"
	| "python"
	| "pythonRequirement"
	| "wasm"
	| "text"
	| "data"
	| "json"
	| "sourcemap";

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
 * The output `worker.config.json`.
 *
 * - Workers mode: `bundle/` present, `mainModule` + `modules` required.
 * - Assets-only mode: `bundle/` absent, `mainModule` + `modules` omitted.
 */
export type OutputWorkerConfig = Omit<ParsedConfig, "entrypoint"> &
	(
		| {
				mainModule: string;
				modules: Record<string, { type: ModuleType }>;
		  }
		// oxlint-disable-next-line typescript/no-empty-object-type -- needed for type intersection
		| {}
	);

export function writeOutputWorkerConfig(
	root: string,
	parsedConfig: ParsedConfig,
	bundle?: {
		mainModule: string;
		modules: Record<string, { type: ModuleType }>;
	}
): void {
	const { entrypoint, ...rest } = parsedConfig;
	const outputConfig = { ...rest, ...bundle };
	const workerOutputDir = path.join(getWorkersDir(root), outputConfig.name);
	fs.mkdirSync(workerOutputDir, { recursive: true });
	const configPath = getWorkerConfigPath(root, outputConfig.name);
	fs.writeFileSync(configPath, JSON.stringify(outputConfig));
}
