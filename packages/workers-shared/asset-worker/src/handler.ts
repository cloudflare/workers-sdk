import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
	NotFoundResponse,
	NotModifiedResponse,
	OkResponse,
	TemporaryRedirectResponse,
} from "./responses";
import { getHeaders } from "./utils/headers";
import type { AssetConfig } from "../../utils/types";
import type EntrypointType from "./index";

export const handleRequest = async (
	request: Request,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists,
	getByETag: typeof EntrypointType.prototype.unstable_getByETag
) => {
	const { pathname, search } = new URL(request.url);

	const decodedPathname = decodePath(pathname);
	const intent = await getIntent(decodedPathname, configuration, exists);

	if (!intent) {
		return new NotFoundResponse();
	}

	// if there was a POST etc. to a route without an asset
	// this should be passed onto a user worker if one exists
	// so prioritise returning a 404 over 405?
	const method = request.method.toUpperCase();
	if (!["GET", "HEAD"].includes(method)) {
		return new MethodNotAllowedResponse();
	}

	const decodedDestination = intent.redirect ?? decodedPathname;
	const encodedDestination = encodePath(decodedDestination);

	/**
	 * The canonical path we serve an asset at is the decoded and re-encoded version.
	 * Thus we need to redirect if that is different from the decoded version.
	 * We combine this with other redirects (e.g. for html_handling) to avoid multiple redirects.
	 */
	if (encodedDestination !== pathname || intent.redirect) {
		return new TemporaryRedirectResponse(encodedDestination + search);
	}

	if (!intent.asset) {
		return new InternalServerErrorResponse(new Error("Unknown action"));
	}

	const asset = await getByETag(intent.asset.eTag);
	const headers = getHeaders(intent.asset.eTag, asset.contentType, request);

	const strongETag = `"${intent.asset.eTag}"`;
	const weakETag = `W/${strongETag}`;
	const ifNoneMatch = request.headers.get("If-None-Match") || "";
	if ([weakETag, strongETag].includes(ifNoneMatch)) {
		return new NotModifiedResponse(null, { headers });
	}

	const body = method === "HEAD" ? null : asset.readableStream;
	switch (intent.asset.status) {
		case 404:
			return new NotFoundResponse(body, { headers });
		case 200:
			return new OkResponse(body, { headers });
	}
};

type Intent =
	| {
			asset: { eTag: string; status: 200 | 404 };
			redirect: null;
	  }
	| { asset: null; redirect: string }
	| null;

export const getIntent = async (
	pathname: string,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists,
	skipRedirects = false
): Promise<Intent> => {
	switch (configuration.html_handling) {
		case "auto-trailing-slash": {
			return htmlHandlingAutoTrailingSlash(
				pathname,
				configuration,
				exists,
				skipRedirects
			);
		}
		case "force-trailing-slash": {
			return htmlHandlingForceTrailingSlash(
				pathname,
				configuration,
				exists,
				skipRedirects
			);
		}
		case "drop-trailing-slash": {
			return htmlHandlingDropTrailingSlash(
				pathname,
				configuration,
				exists,
				skipRedirects
			);
		}
		case "none": {
			return htmlHandlingNone(pathname, configuration, exists);
		}
	}
};

const htmlHandlingAutoTrailingSlash = async (
	pathname: string,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists,
	skipRedirects: boolean
): Promise<Intent> => {
	let redirectResult: Intent = null;
	let eTagResult: string | null = null;
	const exactETag = await exists(pathname);
	if (pathname.endsWith("/index")) {
		if (exactETag) {
			// there's a binary /index file
			return {
				asset: { eTag: exactETag, status: 200 },
				redirect: null,
			};
		} else {
			if (
				(redirectResult = await safeRedirect(
					`${pathname}.html`,
					pathname.slice(0, -"index".length),
					configuration,
					exists,
					skipRedirects
				))
			) {
				// /foo/index.html exists so redirect to /foo/
				return redirectResult;
			} else if (
				(redirectResult = await safeRedirect(
					`${pathname.slice(0, -"/index".length)}.html`,
					pathname.slice(0, -"/index".length),
					configuration,
					exists,
					skipRedirects
				))
			) {
				// /foo.html exists so redirect to /foo
				return redirectResult;
			}
		}
	} else if (pathname.endsWith("/index.html")) {
		if (
			(redirectResult = await safeRedirect(
				pathname,
				pathname.slice(0, -"index.html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo/index.html exists so redirect to /foo/
			return redirectResult;
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -"/index.html".length)}.html`,
				pathname.slice(0, -"/index.html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo
			return redirectResult;
		}
	} else if (pathname.endsWith("/")) {
		if ((eTagResult = await exists(`${pathname}index.html`))) {
			// /foo/index.html exists so serve at /foo/
			return {
				asset: { eTag: eTagResult, status: 200 },
				redirect: null,
			};
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -"/".length)}.html`,
				pathname.slice(0, -"/".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo
			return redirectResult;
		}
	} else if (pathname.endsWith(".html")) {
		if (
			(redirectResult = await safeRedirect(
				pathname,
				pathname.slice(0, -".html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo
			return redirectResult;
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -".html".length)}/index.html`,
				`${pathname.slice(0, -".html".length)}/`,
				configuration,
				exists,
				skipRedirects
			))
		) {
			// request for /foo.html but /foo/index.html exists so redirect to /foo/
			return redirectResult;
		}
	}

	if (exactETag) {
		// there's a binary /foo file
		return {
			asset: { eTag: exactETag, status: 200 },
			redirect: null,
		};
	} else if ((eTagResult = await exists(`${pathname}.html`))) {
		// foo.html exists so serve at /foo
		return {
			asset: { eTag: eTagResult, status: 200 },
			redirect: null,
		};
	} else if (
		(redirectResult = await safeRedirect(
			`${pathname}/index.html`,
			`${pathname}/`,
			configuration,
			exists,
			skipRedirects
		))
	) {
		// /foo/index.html exists so redirect to /foo/
		return redirectResult;
	}

	return notFound(pathname, configuration, exists);
};

const htmlHandlingForceTrailingSlash = async (
	pathname: string,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists,
	skipRedirects: boolean
): Promise<Intent> => {
	let redirectResult: Intent = null;
	let eTagResult: string | null = null;
	const exactETag = await exists(pathname);
	if (pathname.endsWith("/index")) {
		if (exactETag) {
			// there's a binary /index file
			return {
				asset: { eTag: exactETag, status: 200 },
				redirect: null,
			};
		} else {
			if (
				(redirectResult = await safeRedirect(
					`${pathname}.html`,
					pathname.slice(0, -"index".length),
					configuration,
					exists,
					skipRedirects
				))
			) {
				// /foo/index.html exists so redirect to /foo/
				return redirectResult;
			} else if (
				(redirectResult = await safeRedirect(
					`${pathname.slice(0, -"/index".length)}.html`,
					pathname.slice(0, -"index".length),
					configuration,
					exists,
					skipRedirects
				))
			) {
				// /foo.html exists so redirect to /foo/
				return redirectResult;
			}
		}
	} else if (pathname.endsWith("/index.html")) {
		if (
			(redirectResult = await safeRedirect(
				pathname,
				pathname.slice(0, -"index.html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo/index.html exists so redirect to /foo/
			return redirectResult;
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -"/index.html".length)}.html`,
				pathname.slice(0, -"index.html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo/
			return redirectResult;
		}
	} else if (pathname.endsWith("/")) {
		if ((eTagResult = await exists(`${pathname}index.html`))) {
			// /foo/index.html exists so serve at /foo/
			return {
				asset: { eTag: eTagResult, status: 200 },
				redirect: null,
			};
		} else if (
			(eTagResult = await exists(`${pathname.slice(0, -"/".length)}.html`))
		) {
			// /foo.html exists so serve at /foo/
			return {
				asset: { eTag: eTagResult, status: 200 },
				redirect: null,
			};
		}
	} else if (pathname.endsWith(".html")) {
		if (
			(redirectResult = await safeRedirect(
				pathname,
				`${pathname.slice(0, -".html".length)}/`,
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo/
			return redirectResult;
		} else if (exactETag) {
			// there's both /foo.html and /foo/index.html so we serve /foo.html at /foo.html only
			return {
				asset: { eTag: exactETag, status: 200 },
				redirect: null,
			};
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -".html".length)}/index.html`,
				`${pathname.slice(0, -".html".length)}/`,
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo/index.html exists so redirect to /foo/
			return redirectResult;
		}
	}

	if (exactETag) {
		// there's a binary /foo file
		return {
			asset: { eTag: exactETag, status: 200 },
			redirect: null,
		};
	} else if (
		(redirectResult = await safeRedirect(
			`${pathname}.html`,
			`${pathname}/`,
			configuration,
			exists,
			skipRedirects
		))
	) {
		// /foo.html exists so redirect to /foo/
		return redirectResult;
	} else if (
		(redirectResult = await safeRedirect(
			`${pathname}/index.html`,
			`${pathname}/`,
			configuration,
			exists,
			skipRedirects
		))
	) {
		// /foo/index.html exists so redirect to /foo/
		return redirectResult;
	}

	return notFound(pathname, configuration, exists);
};

const htmlHandlingDropTrailingSlash = async (
	pathname: string,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists,
	skipRedirects: boolean
): Promise<Intent> => {
	let redirectResult: Intent = null;
	let eTagResult: string | null = null;
	const exactETag = await exists(pathname);
	if (pathname.endsWith("/index")) {
		if (exactETag) {
			// there's a binary /index file
			return {
				asset: { eTag: exactETag, status: 200 },
				redirect: null,
			};
		} else {
			if (pathname === "/index") {
				if (
					(redirectResult = await safeRedirect(
						"/index.html",
						"/",
						configuration,
						exists,
						skipRedirects
					))
				) {
					return redirectResult;
				}
			} else if (
				(redirectResult = await safeRedirect(
					`${pathname.slice(0, -"/index".length)}.html`,
					pathname.slice(0, -"/index".length),
					configuration,
					exists,
					skipRedirects
				))
			) {
				// /foo.html exists so redirect to /foo
				return redirectResult;
			} else if (
				(redirectResult = await safeRedirect(
					`${pathname}.html`,
					pathname.slice(0, -"/index".length),
					configuration,
					exists,
					skipRedirects
				))
			) {
				// /foo/index.html exists so redirect to /foo
				return redirectResult;
			}
		}
	} else if (pathname.endsWith("/index.html")) {
		// special handling so you don't drop / if the path is just /
		if (pathname === "/index.html") {
			if (
				(redirectResult = await safeRedirect(
					"/index.html",
					"/",
					configuration,
					exists,
					skipRedirects
				))
			) {
				return redirectResult;
			}
		} else if (
			(redirectResult = await safeRedirect(
				pathname,
				pathname.slice(0, -"/index.html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo/index.html exists so redirect to /foo
			return redirectResult;
		} else if (exactETag) {
			// there's both /foo.html and /foo/index.html so we serve /foo/index.html at /foo/index.html only
			return {
				asset: { eTag: exactETag, status: 200 },
				redirect: null,
			};
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -"/index.html".length)}.html`,
				pathname.slice(0, -"/index.html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo
			return redirectResult;
		}
	} else if (pathname.endsWith("/")) {
		if (pathname === "/") {
			if ((eTagResult = await exists("/index.html"))) {
				// /index.html exists so serve at /
				return {
					asset: { eTag: eTagResult, status: 200 },
					redirect: null,
				};
			}
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -"/".length)}.html`,
				pathname.slice(0, -"/".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo
			return redirectResult;
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -"/".length)}/index.html`,
				pathname.slice(0, -"/".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo/index.html exists so redirect to /foo
			return redirectResult;
		}
	} else if (pathname.endsWith(".html")) {
		if (
			(redirectResult = await safeRedirect(
				pathname,
				pathname.slice(0, -".html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo.html exists so redirect to /foo
			return redirectResult;
		} else if (
			(redirectResult = await safeRedirect(
				`${pathname.slice(0, -".html".length)}/index.html`,
				pathname.slice(0, -".html".length),
				configuration,
				exists,
				skipRedirects
			))
		) {
			// /foo/index.html exists so redirect to /foo
			return redirectResult;
		}
	}

	if (exactETag) {
		// there's a binary /foo file
		return {
			asset: { eTag: exactETag, status: 200 },
			redirect: null,
		};
	} else if ((eTagResult = await exists(`${pathname}.html`))) {
		// /foo.html exists so serve at /foo
		return {
			asset: { eTag: eTagResult, status: 200 },
			redirect: null,
		};
	} else if ((eTagResult = await exists(`${pathname}/index.html`))) {
		// /foo/index.html exists so serve at /foo
		return {
			asset: { eTag: eTagResult, status: 200 },
			redirect: null,
		};
	}

	return notFound(pathname, configuration, exists);
};

const htmlHandlingNone = async (
	pathname: string,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists
): Promise<Intent> => {
	const exactETag = await exists(pathname);
	if (exactETag) {
		return {
			asset: { eTag: exactETag, status: 200 },
			redirect: null,
		};
	} else {
		return notFound(pathname, configuration, exists);
	}
};

const notFound = async (
	pathname: string,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists
): Promise<Intent> => {
	switch (configuration.not_found_handling) {
		case "single-page-application": {
			const eTag = await exists("/index.html");
			if (eTag) {
				return {
					asset: { eTag, status: 200 },
					redirect: null,
				};
			}
			return null;
		}
		case "404-page": {
			let cwd = pathname;
			while (cwd) {
				cwd = cwd.slice(0, cwd.lastIndexOf("/"));
				const eTag = await exists(`${cwd}/404.html`);
				if (eTag) {
					return {
						asset: { eTag, status: 404 },
						redirect: null,
					};
				}
			}
			return null;
		}
		case "none":
		default: {
			return null;
		}
	}
};

const safeRedirect = async (
	file: string,
	destination: string,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists,
	skip: boolean
): Promise<Intent> => {
	if (skip) {
		return null;
	}

	if (!(await exists(destination))) {
		const intent = await getIntent(destination, configuration, exists, true);
		// return only if the eTag matches - i.e. not the 404 case
		if (intent?.asset && intent.asset.eTag === (await exists(file))) {
			return {
				asset: null,
				redirect: destination,
			};
		}
	}

	return null;
};
/**
 *
 * +===========================================+===========+======================+
 * |              character type               |  fetch()  | encodeURIComponent() |
 * +===========================================+===========+======================+
 * | unreserved ASCII e.g. a-z                 | unchanged | unchanged            |
 * +-------------------------------------------+-----------+----------------------+
 * | reserved (sometimes encoded)			   | unchanged | encoded			  |
 * | e.g. [ ] @ $ ! ' ( ) * + , ; = : ? # & %  |           |                      |
 * +-------------------------------------------+-----------+----------------------+
 * | non-ASCII e.g. ü. and space               | encoded   | encoded              |
 * +-------------------------------------------+-----------+----------------------+
 *
 * 1. Decode incoming path to handle non-ASCII characters or optionally encoded characters (e.g. square brackets)
 * 2. Match decoded path to manifest
 * 3. Re-encode the path and redirect if the re-encoded path is different from the original path
 *
 * If the user uploads a file that is already URL-encoded, that is accessible only at the (double) encoded path.
 * e.g. /%5Bboop%5D.html is served at /%255Bboop%255D only
 *
 * */

/**
 * Decode all incoming paths to ensure that we can handle paths with non-ASCII characters.
 */
export const decodePath = (pathname: string) => {
	return pathname
		.split("/")
		.map((x) => decodeURIComponent(x))
		.join("/");
};
/**
 * Use the encoded path as the canonical path for sometimes-encoded characters
 * e.g. /[boop] -> /%5Bboop%5D 307
 */
const encodePath = (pathname: string) => {
	return pathname
		.split("/")
		.map((x) => encodeURIComponent(x))
		.join("/");
};
