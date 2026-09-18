import * as path from "node:path";

/**
 * Initial draft version of the Build Output Specification.
 *
 * Will move to `v1` when the spec stabilises.
 */
export const BUILD_OUTPUT_VERSION = "v0";

/** Root-relative build output directory. */
export const BUILD_OUTPUT_ROOT = ".cloudflare/output";

/** Filename of the top-level config in the Build Output Specification. */
export const ROOT_CONFIG_FILENAME = "config.json";

/** Filename of each Worker config in the Build Output Specification. */
export const WORKER_CONFIG_FILENAME = "worker.config.json";

/** Filename of each Container config in the Build Output Specification. */
export const CONTAINER_CONFIG_FILENAME = "container.config.json";

/** Name of the directory containing the default Worker. */
export const DEFAULT_WORKER_DIRECTORY_NAME = "default";

/** Absolute path to the Build Output Specification directory. */
export function getBuildOutputDir(root: string): string {
	return path.resolve(root, BUILD_OUTPUT_ROOT);
}

/**
 * Absolute path to the top-level `config.json`.
 *
 * Holds the settings declared at the top level of `cloudflare.config.ts` and
 * build context.
 */
export function getRootConfigPath(root: string): string {
	return path.join(
		getBuildOutputDir(root),
		BUILD_OUTPUT_VERSION,
		ROOT_CONFIG_FILENAME
	);
}

/**
 * Absolute path to the Workers output directory.
 */
export function getWorkersDir(root: string): string {
	return path.join(getBuildOutputDir(root), BUILD_OUTPUT_VERSION, "workers");
}

/**
 * Absolute path to the Containers output directory.
 */
export function getContainersDir(root: string): string {
	return path.join(getBuildOutputDir(root), BUILD_OUTPUT_VERSION, "containers");
}

function validateDirectoryName(name: string, resourceType: string): void {
	if (
		name.length === 0 ||
		name === "." ||
		name === ".." ||
		name.includes("/") ||
		name.includes("\\") ||
		name.includes("\0")
	) {
		throw new Error(
			`${resourceType} directory names must be non-empty, single path segments. Received ${JSON.stringify(name)}.`
		);
	}
}

/**
 * Absolute path to a Worker's directory (`workers/<directory-name>`).
 */
export function getWorkerDir(
	root: string,
	directoryName = DEFAULT_WORKER_DIRECTORY_NAME
): string {
	validateDirectoryName(directoryName, "Worker");

	return path.join(getWorkersDir(root), directoryName);
}

/**
 * Absolute path to a Container's directory (`containers/<directory-name>`).
 */
export function getContainerDir(root: string, directoryName: string): string {
	validateDirectoryName(directoryName, "Container");

	return path.join(getContainersDir(root), directoryName);
}

/**
 * Absolute path to the Container's config file.
 */
export function getContainerConfigPath(
	root: string,
	directoryName: string
): string {
	return path.join(
		getContainerDir(root, directoryName),
		CONTAINER_CONFIG_FILENAME
	);
}

/**
 * Absolute path to the Worker's config file.
 */
export function getWorkerConfigPath(
	root: string,
	directoryName = DEFAULT_WORKER_DIRECTORY_NAME
): string {
	return path.join(getWorkerDir(root, directoryName), WORKER_CONFIG_FILENAME);
}

/**
 * Absolute path to the Worker's bundle directory.
 */
export function getWorkerBundleDir(
	root: string,
	directoryName = DEFAULT_WORKER_DIRECTORY_NAME
): string {
	return path.join(getWorkerDir(root, directoryName), "bundle");
}

/**
 * Absolute path to the Worker's assets directory.
 */
export function getWorkerAssetsDir(
	root: string,
	directoryName = DEFAULT_WORKER_DIRECTORY_NAME
): string {
	return path.join(getWorkerDir(root, directoryName), "assets");
}
