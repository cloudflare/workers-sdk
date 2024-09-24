import path from "node:path";

// https://nodejs.org/api/url.html#urlfileurltopathurl
export function fileURLToPath(url: string | URL): string {
	// https://github.com/denoland/deno_std/blob/01a401c432fd5628efd3a4fafffdc14660efe9e2/node/url.ts#L1286
	// Thanks 🦖!
	if (typeof url === "string") {
		url = new URL(url);
	} else if (!(url instanceof URL)) {
		throw new TypeError(`Expected path to be string | URL, got ${url}`);
	}
	if (url.protocol !== "file:") {
		throw new TypeError("Expected protocol to be file:");
	}
	return getPathFromURLPosix(url);
}
function getPathFromURLPosix(url: URL) {
	if (url.hostname !== "") {
		throw new TypeError("Expected hostname to be empty");
	}
	const pathname = url.pathname;
	for (let n = 0; n < pathname.length; n++) {
		if (pathname[n] === "%") {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const third = pathname.codePointAt(n + 2)! | 0x20;
			if (pathname[n + 1] === "2" && third === 102) {
				throw new TypeError(
					"Expected pathname not to include encoded / characters"
				);
			}
		}
	}
	return decodeURIComponent(pathname);
}

export const CHAR_FORWARD_SLASH = 47; /* / */
const percentRegEx = /%/g;
const backslashRegEx = /\\/g;
const newlineRegEx = /\n/g;
const carriageReturnRegEx = /\r/g;
const tabRegEx = /\t/g;
const questionRegex = /\?/g;
const hashRegex = /#/g;
// https://nodejs.org/api/url.html#urlpathtofileurlpath
export function pathToFileURL(filepath: string): URL {
	// https://github.com/denoland/deno_std/blob/01a401c432fd5628efd3a4fafffdc14660efe9e2/node/url.ts#L1391
	// Thanks 🦖!
	let resolved = path.resolve(filepath);
	// path.resolve strips trailing slashes so we must add them back
	const filePathLast = filepath.charCodeAt(filepath.length - 1);
	if (
		filePathLast === CHAR_FORWARD_SLASH &&
		resolved[resolved.length - 1] !== path.sep
	) {
		resolved += "/";
	}
	resolved = encodePathChars(resolved);
	// Question and hash character should be included in pathname.
	// Therefore, encoding is required to eliminate parsing them in different states.
	// This is done as an optimization to not creating a URL instance and
	// later triggering pathname setter, which impacts performance
	if (resolved.indexOf("?") !== -1) {
		resolved = resolved.replace(questionRegex, "%3F");
	}
	if (resolved.indexOf("#") !== -1) {
		resolved = resolved.replace(hashRegex, "%23");
	}
	return new URL(`file://${resolved}`);
}
function encodePathChars(filepath: string): string {
	if (filepath.indexOf("%") !== -1) {
		filepath = filepath.replace(percentRegEx, "%25");
	}
	// In posix, backslash is a valid character in paths:
	if (filepath.indexOf("\\") !== -1) {
		filepath = filepath.replace(backslashRegEx, "%5C");
	}
	if (filepath.indexOf("\n") !== -1) {
		filepath = filepath.replace(newlineRegEx, "%0A");
	}
	if (filepath.indexOf("\r") !== -1) {
		filepath = filepath.replace(carriageReturnRegEx, "%0D");
	}
	if (filepath.indexOf("\t") !== -1) {
		filepath = filepath.replace(tabRegEx, "%09");
	}
	return filepath;
}

export default {
	fileURLToPath,
	pathToFileURL,
};
