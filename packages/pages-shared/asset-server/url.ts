/**
 * Stringifies a URL instance to a root-relative path string
 * @param url The URL to stringify
 * @returns A root-relative path string
 */
export function stringifyURLToRootRelativePathname(url: URL): string {
	return `${url.pathname}${url.search}${url.hash}`;
}
