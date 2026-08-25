import * as path from "node:path";

/**
 * Initial draft version of the Build Output Specification.
 *
 * Will move to `v1` when the spec stabilises.
 */
export const BUILD_OUTPUT_VERSION = "v0";

/**
 * Project-relative root.
 */
export const BUILD_OUTPUT_ROOT = ".cloudflare/output";

/**
 * Filename shared by every config in the Build Output Specification.
 *
 * Configs are discriminated by their `type` field.
 */
export const CONFIG_FILENAME = "config.json";

/**
 * Name of the sub-directory under `workers/` holding the Worker.
 *
 * This corresponds with the export name in the input `cloudflare.config.ts`.
 */
export const DEFAULT_WORKER_EXPORT = "default";

/**
 * Absolute path to the Build Output Specification root for the current project.
 */
export function getBuildOutputDir(root: string): string {
	return path.resolve(root, BUILD_OUTPUT_ROOT);
}

/**
 * Absolute path to the top-level `config.json` for the current project.
 *
 * Holds the project-level settings shared by every Worker: those declared by
 * the `settings` export of the input `cloudflare.config.ts`, including the
 * mode the build was produced in.
 */
export function getSettingsConfigPath(root: string): string {
	return path.join(
		getBuildOutputDir(root),
		BUILD_OUTPUT_VERSION,
		CONFIG_FILENAME
	);
}

/**
 * Absolute path to the Workers output directory.
 */
export function getWorkersDir(root: string): string {
	return path.join(getBuildOutputDir(root), BUILD_OUTPUT_VERSION, "workers");
}

/**
 * Absolute path to the Worker's directory (`workers/default`).
 */
export function getWorkerDir(root: string): string {
	return path.join(getWorkersDir(root), DEFAULT_WORKER_EXPORT);
}

/**
 * Absolute path to the Worker's config file.
 */
export function getWorkerConfigPath(root: string): string {
	return path.join(getWorkerDir(root), CONFIG_FILENAME);
}

/**
 * Absolute path to the Worker's bundle directory.
 */
export function getWorkerBundleDir(root: string): string {
	return path.join(getWorkerDir(root), "bundle");
}

/**
 * Absolute path to the Worker's assets directory.
 */
export function getWorkerAssetsDir(root: string): string {
	return path.join(getWorkerDir(root), "assets");
}
