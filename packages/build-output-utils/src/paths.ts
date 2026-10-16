import * as path from "node:path";

/**
 * Initial draft version of the Build Output Specification.
 *
 * Will move to `v1` when the spec stabilises.
 */
export const BUILD_OUTPUT_VERSION = "v0";

/** Build output directory relative to the project root. */
export const BUILD_OUTPUT_ROOT = ".cloudflare/output";

/** Filename of the root config in the Build Output Specification. */
export const ROOT_CONFIG_FILENAME = "config.json";

/** Filename of each Worker config in the Build Output Specification. */
export const WORKER_CONFIG_FILENAME = "worker.config.json";

/** Filename of each Container config in the Build Output Specification. */
export const CONTAINER_CONFIG_FILENAME = "container.config.json";

/** Name of the directory containing the default Worker. */
export const DEFAULT_WORKER_DIRECTORY_NAME = "default";

// oxlint-disable-next-line no-control-regex -- Windows forbids control characters in file names.
const INVALID_DIRECTORY_NAME_CHARACTERS = /[\s<>:"/\\|?*\u0000-\u001f]+|\.+$/g;
const WINDOWS_RESERVED_NAME =
	/^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/;
// Leave room for the prefix added to Windows reserved names.
const MAX_DIRECTORY_NAME_BYTES = 254;

/** Absolute path to the Build Output Specification directory. */
export function getBuildOutputDir(root: string): string {
	return path.resolve(root, BUILD_OUTPUT_ROOT);
}

/**
 * Absolute path to the root `config.json`.
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

/**
 * Convert a Cloudflare resource name into a portable, case-insensitive
 * directory name.
 *
 * The original resource name remains in its config file. Callers must reject
 * collisions when multiple resource names normalise to the same directory.
 */
export function normalizeDirectoryName(name: string): string {
	const directoryName = truncateUtf8(
		name.toLowerCase(),
		MAX_DIRECTORY_NAME_BYTES
	).replace(INVALID_DIRECTORY_NAME_CHARACTERS, "-");

	return WINDOWS_RESERVED_NAME.test(directoryName)
		? `_${directoryName}`
		: directoryName;
}

function truncateUtf8(value: string, maxBytes: number): string {
	let result = "";
	let byteLength = 0;
	for (const character of value) {
		const characterByteLength = Buffer.byteLength(character);
		if (byteLength + characterByteLength > maxBytes) {
			break;
		}

		result += character;
		byteLength += characterByteLength;
	}
	return result;
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
