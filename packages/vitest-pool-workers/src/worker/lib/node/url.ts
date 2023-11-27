import path from "node:path";

// https://nodejs.org/api/url.html#class-url
const _URL = URL;
export { _URL as URL };

// https://nodejs.org/api/url.html#class-urlsearchparams
const _URLSearchParams = URLSearchParams;
export { _URLSearchParams as URLSearchParams };

// https://nodejs.org/api/url.html#urldomaintoasciidomain
export function domainToASCII(_domain: string): string {
	throw new Error("domainToASCII() not yet implemented in worker");
}

// https://nodejs.org/api/url.html#urldomaintounicodedomain
export function domainToUnicode(_domain: string): string {
	throw new Error("domainToASCII() not yet implemented in worker");
}

// https://nodejs.org/api/url.html#urlfileurltopathurl
// eslint-disable-next-line no-shadow
export function fileURLToPath(path: string | URL): string {
	// https://github.com/denoland/deno_std/blob/01a401c432fd5628efd3a4fafffdc14660efe9e2/node/url.ts#L1286
	// Thanks 🦖!
	if (typeof path === "string") path = new URL(path);
	else if (!(path instanceof URL)) {
		throw new TypeError(`Expected path to be string | URL, got ${path}`);
	}
	if (path.protocol !== "file:") {
		throw new TypeError("Expected protocol to be file:");
	}
	return getPathFromURLPosix(path);
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

// https://nodejs.org/api/url.html#urlformaturl-options
export function format(_url: URL | Url, _options: unknown): string {
	throw new Error("format() not yet implemented in worker");
}

export const CHAR_FORWARD_SLASH = 47; /* / */
const percentRegEx = /%/g;
const backslashRegEx = /\\/g;
const newlineRegEx = /\n/g;
const carriageReturnRegEx = /\r/g;
const tabRegEx = /\t/g;
// https://nodejs.org/api/url.html#urlpathtofileurlpath
export function pathToFileURL(filepath: string): URL {
	// return filepath as unknown as URL; // FIXME: this is a hack to get around dynamic `import()` not respecting URLs correctly, TODO: try reproduce and report

	// https://github.com/denoland/deno_std/blob/01a401c432fd5628efd3a4fafffdc14660efe9e2/node/url.ts#L1391
	// Thanks 🦖!
	const outURL = new URL("file://");
	let resolved = path.resolve(filepath);
	// path.resolve strips trailing slashes so we must add them back
	const filePathLast = filepath.charCodeAt(filepath.length - 1);
	if (
		filePathLast === CHAR_FORWARD_SLASH &&
		resolved[resolved.length - 1] !== path.sep
	) {
		resolved += "/";
	}
	outURL.pathname = encodePathChars(resolved);
	return outURL;
}
function encodePathChars(filepath: string): string {
	if (filepath.includes("%")) {
		filepath = filepath.replace(percentRegEx, "%25");
	}
	// In posix, backslash is a valid character in paths:
	if (filepath.includes("\\")) {
		filepath = filepath.replace(backslashRegEx, "%5C");
	}
	if (filepath.includes("\n")) {
		filepath = filepath.replace(newlineRegEx, "%0A");
	}
	if (filepath.includes("\r")) {
		filepath = filepath.replace(carriageReturnRegEx, "%0D");
	}
	if (filepath.includes("\t")) {
		filepath = filepath.replace(tabRegEx, "%09");
	}
	return filepath;
}

// https://nodejs.org/api/url.html#urlurltohttpoptionsurl
export function urlToHttpOptions(_url: string): unknown {
	throw new Error("urlToHttpOptions() not yet implemented in worker");
}

// https://nodejs.org/api/url.html#legacy-urlobject
export class Url {}

export function parse(
	_urlString: string,
	_parseQueryString?: boolean,
	_slashesDenoteHost?: boolean
): Url {
	throw new Error("parse() not yet implemented in worker");
}

export function resolve(_from: string, _to: string): string {
	throw new Error("resolve() not yet implemented in worker");
}

export default {
	URL,
	URLSearchParams,
	domainToASCII,
	domainToUnicode,
	fileURLToPath,
	format,
	pathToFileURL,
	urlToHttpOptions,
	Url,
	parse,
	resolve,
};
