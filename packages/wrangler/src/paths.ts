import { assert } from "console";

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
