import { assert } from "console";
import path from "node:path";

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
 * Get a path, relative to process.cwd(), prefixed with ./ if in a nested
 * subdirectory, to aid with readability:
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
