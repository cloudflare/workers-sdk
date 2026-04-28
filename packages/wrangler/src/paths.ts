import { assert } from "node:console";
import fs from "node:fs";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import onExit from "signal-exit";

type DiscriminatedPath<Discriminator extends string> = string & {
	_discriminator: Discriminator;
};

/**
 * A branded string that expects to be URL compatible.
 *
 * Require this type when you want callers to ensure that they have converted file-path strings into URL-safe paths.
 */
export type UrlPath = DiscriminatedPath<"UrlPath">;

/**
 * Convert a file-path string to a URL-path string.
 *
 * Use this helper to convert a `string` to a `UrlPath` when it is not clear whether the string needs normalizing.
 * Replaces all back-slashes with forward-slashes, and throws an error if the path contains a drive letter (e.g. `C:`).
 */
export function toUrlPath(filePath: string): UrlPath {
	assert(
		!/^[a-z]:/i.test(filePath),
		"Tried to convert a Windows file path with a drive to a URL path."
	);
	return filePath.replace(/\\/g, "/") as UrlPath;
}

/**
 * Get a human-readable path, relative to process.cwd(), prefixed with ./ if
 * in a nested subdirectory, to aid with readability.
 * Only used for logging e.g. `Loading DB at ${readableRelative(dbPath)}`:
 *
 * E.g. (assuming process.cwd() is /pwd)
 *
 *	readableRelative('/pwd/wrangler.toml') => 'wrangler.toml'
 *	readableRelative('/wrangler.toml') => '../wrangler.toml'
 *	readableRelative('/pwd/subdir/wrangler.toml') => './subdir/wrangler.toml'
 *
 * */
export function readableRelative(to: string) {
	const relativePath = path.relative(process.cwd(), to);
	if (
		// No directory nesting, return as-is
		path.basename(relativePath) === relativePath ||
		// Outside current directory
		relativePath.startsWith(".")
	) {
		return relativePath;
	} else {
		return "./" + relativePath;
	}
}

/**
 * The __RELATIVE_PACKAGE_PATH__ is defined either in the esbuild config (for production)
 * or the vitest.setup.ts (for unit testing).
 */
declare const __RELATIVE_PACKAGE_PATH__: string;

/**
 * Use this function (rather than Node.js constants like `__dirname`) to specify
 * paths that are relative to the base path of the Wrangler package.
 *
 * It is important to use this function because it reliably maps to the root of the package
 * no matter whether the code has been bundled or not.
 */
export function getBasePath(): string {
	// eslint-disable-next-line no-restricted-globals
	return path.resolve(__dirname, __RELATIVE_PACKAGE_PATH__);
}

/**
 * A short-lived directory. Automatically removed when the process exits, but
 * can be removed earlier by calling `remove()`.
 */
export interface EphemeralDirectory {
	path: string;
	remove(): void;
}

/**
 * Gets the path to the project's `.wrangler` folder.
 */
export function getWranglerHiddenDirPath(
	projectRoot: string | undefined
): string {
	projectRoot ??= process.cwd();
	return path.join(projectRoot, ".wrangler");
}

/**
 * Gets a temporary directory in the project's `.wrangler` folder with the
 * specified prefix. We create temporary directories in `.wrangler` as opposed
 * to the OS's temporary directory to avoid issues with different drive letters
 * on Windows. For example, when `esbuild` outputs a file to a different drive
 * than the input sources, the generated source maps are incorrect.
 */
export function getWranglerTmpDir(
	projectRoot: string | undefined,
	prefix: string,
	cleanup = true
): EphemeralDirectory {
	const tmpRoot = path.join(getWranglerHiddenDirPath(projectRoot), "tmp");
	fs.mkdirSync(tmpRoot, { recursive: true });

	const tmpPrefix = path.join(tmpRoot, `${prefix}-`);
	const tmpDir = fs.realpathSync(fs.mkdtempSync(tmpPrefix));

	const cleanupDir = () => {
		if (cleanup) {
			try {
				removeDirSync(tmpDir);
			} catch {
				/* best effort */
			}
		}
	};
	const removeExitListener = onExit(cleanupDir);

	return {
		path: tmpDir,
		remove() {
			removeExitListener();
			cleanupDir();
		},
	};
}
