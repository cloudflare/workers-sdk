import { assert } from "node:console";
import { resolve } from "node:path";

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
export function toUrlPath(path: string): UrlPath {
	assert(
		!/^[a-z]:/i.test(path),
		"Tried to convert a Windows file path with a drive to a URL path."
	);
	return path.replace(/\\/g, "/") as UrlPath;
}

/**
 * The __RELATIVE_PACKAGE_PATH__ is defined either in the esbuild config (for production)
 * or the jest.setup.ts (for unit testing).
 */
declare const __RELATIVE_PACKAGE_PATH__: string;

/**
 * Use this function (rather than node.js constants like `__dirname`) to specify
 * paths that are relative to the base path of the Wrangler package.
 *
 * It is important to use this function because it reliably maps to the root of the package
 * no matter whether the code has been bundled or not.
 */
export function getBasePath(): string {
	// eslint-disable-next-line no-restricted-globals
	return resolve(__dirname, __RELATIVE_PACKAGE_PATH__);
}
