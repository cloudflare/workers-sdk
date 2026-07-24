import path from "node:path";

// Re-export from @cloudflare/workers-utils — this file is kept for
// backward compatibility with existing Wrangler-internal imports and to keep
// the initial migration minimal without changing lots and lots of files
// TODO(dario): after the initial pages-functions migration remove these re-exports
export { toUrlPath } from "@cloudflare/workers-utils";
export type { UrlPath } from "@cloudflare/workers-utils";

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
	// eslint-disable-next-line no-restricted-globals -- __dirname is the correct baseline for resolving the package root at runtime
	return path.resolve(__dirname, __RELATIVE_PACKAGE_PATH__);
}
