import {
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
	NoIntentResponse,
	NotFoundResponse,
	NotModifiedResponse,
	OkResponse,
	TemporaryRedirectResponse,
} from "../../utils/responses";
import { getAssetHeaders } from "./utils/headers";
import type { AssetConfig } from "../../utils/types";
import type EntrypointType from "./index";
import type { Env } from "./index";

type AssetIntent = {
	eTag: string;
	status: typeof OkResponse.status | typeof NotFoundResponse.status;
};

const getResponseOrAssetIntent = async (
	request: Request,
	env: Env,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists
) => {
	const { pathname, search } = new URL(request.url);

	const decodedPathname = decodePath(pathname);

	const intent = await getIntent(decodedPathname, configuration, exists);

	if (!intent) {
		return env.JAEGER.enterSpan("no_intent", (span) => {
			span.setTags({
				decodedPathname,
				configuration: JSON.stringify(configuration),
				status: NoIntentResponse.status,
			});

			return new NoIntentResponse();
		});
	}

	const method = request.method.toUpperCase();
	if (!["GET", "HEAD"].includes(method)) {
		return env.JAEGER.enterSpan("method_not_allowed", (span) => {
			span.setTags({
				method,
				status: MethodNotAllowedResponse.status,
			});

			return new MethodNotAllowedResponse();
		});
	}

	const decodedDestination = intent.redirect ?? decodedPathname;
	const encodedDestination = encodePath(decodedDestination);

	/**
	 * The canonical path we serve an asset at is the decoded and re-encoded version.
	 * Thus we need to redirect if that is different from the decoded version.
	 * We combine this with other redirects (e.g. for html_handling) to avoid multiple redirects.
	 */
	if ((encodedDestination !== pathname && intent.asset) || intent.redirect) {
		return env.JAEGER.enterSpan("redirect", (span) => {
			span.setTags({
				originalPath: pathname,
				location:
					encodedDestination !== pathname
						? encodedDestination
						: intent.redirect ?? "<unknown>",
				status: TemporaryRedirectResponse.status,
			});

			return new TemporaryRedirectResponse(encodedDestination + search);
		});
	}

	if (!intent.asset) {
		return env.JAEGER.enterSpan("unknown_action", (span) => {
			span.setTags({
				pathname,
				status: InternalServerErrorResponse.status,
			});

			return new InternalServerErrorResponse(new Error("Unknown action"));
		});
	}

	return intent.asset;
};

const resolveAssetIntentToResponse = async (
	assetIntent: AssetIntent,
	request: Request,
	env: Env,
	getByETag: typeof EntrypointType.prototype.unstable_getByETag
) => {
	const { pathname } = new URL(request.url);
	const method = request.method.toUpperCase();

	const asset = await env.JAEGER.enterSpan("getByETag", async (span) => {
		span.setTags({
			pathname,
			eTag: assetIntent.eTag,
			status: assetIntent.status,
		});

		return await getByETag(assetIntent.eTag);
	});

	const headers = getAssetHeaders(assetIntent.eTag, asset.contentType, request);

	const strongETag = `"${assetIntent.eTag}"`;
	const weakETag = `W/${strongETag}`;
	const ifNoneMatch = request.headers.get("If-None-Match") || "";
	if ([weakETag, strongETag].includes(ifNoneMatch)) {
		return env.JAEGER.enterSpan("matched_etag", (span) => {
			span.setTags({
				matchedEtag: ifNoneMatch,
				status: NotModifiedResponse.status,
			});

			return new NotModifiedResponse(null, { headers });
		});
	}

	return env.JAEGER.enterSpan("response", (span) => {
		span.setTags({
			etag: assetIntent.eTag,
			status: assetIntent.status,
			head: method === "HEAD",
		});

		const body = method === "HEAD" ? null : asset.readableStream;
		switch (assetIntent.status) {
			case NotFoundResponse.status:
				return new NotFoundResponse(body, { headers });
			case OkResponse.status:
				return new OkResponse(body, { headers });
		}
	});
};

export const canFetch = async (
	request: Request,
	env: Env,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists
): Promise<boolean> => {
	const responseOrAssetIntent = await getResponseOrAssetIntent(
		request,
		env,
		{
			...configuration,
			not_found_handling: "none",
		},
		exists
	);

	if (responseOrAssetIntent instanceof NoIntentResponse) {
		return false;
	}

	return true;
};

export const handleRequest = async (
	request: Request,
	env: Env,
	configuration: Required<AssetConfig>,
	exists: typeof EntrypointType.prototype.unstable_exists,
	getByETag: typeof EntrypointType.prototype.unstable_getByETag
) => {
	const responseOrAssetIntent = await getResponseOrAssetIntent(
		request,
		env,
		configuration,
		exists
	);

	const response =
		responseOrAssetIntent instanceof Response
			? responseOrAssetIntent
			: await resolveAssetIntentToResponse(
					responseOrAssetIntent,
					request,
					env,
					getByETag
				);

	return response;
};

type Intent =
	| {
			asset: AssetIntent;
			redirect: null;
	  }
	| { asset: null; redirect: string }
	| null;

// TODO: Trace this
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
				asset: { eTag: exactETag, status: OkResponse.status },
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
				asset: { eTag: eTagResult, status: OkResponse.status },
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
			asset: { eTag: exactETag, status: OkResponse.status },
			redirect: null,
		};
	} else if ((eTagResult = await exists(`${pathname}.html`))) {
		// foo.html exists so serve at /foo
		return {
			asset: { eTag: eTagResult, status: OkResponse.status },
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
				asset: { eTag: exactETag, status: OkResponse.status },
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
				asset: { eTag: eTagResult, status: OkResponse.status },
				redirect: null,
			};
		} else if (
			(eTagResult = await exists(`${pathname.slice(0, -"/".length)}.html`))
		) {
			// /foo.html exists so serve at /foo/
			return {
				asset: { eTag: eTagResult, status: OkResponse.status },
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
				asset: { eTag: exactETag, status: OkResponse.status },
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
			asset: { eTag: exactETag, status: OkResponse.status },
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
				asset: { eTag: exactETag, status: OkResponse.status },
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
				asset: { eTag: exactETag, status: OkResponse.status },
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
					asset: { eTag: eTagResult, status: OkResponse.status },
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
			asset: { eTag: exactETag, status: OkResponse.status },
			redirect: null,
		};
	} else if ((eTagResult = await exists(`${pathname}.html`))) {
		// /foo.html exists so serve at /foo
		return {
			asset: { eTag: eTagResult, status: OkResponse.status },
			redirect: null,
		};
	} else if ((eTagResult = await exists(`${pathname}/index.html`))) {
		// /foo/index.html exists so serve at /foo
		return {
			asset: { eTag: eTagResult, status: OkResponse.status },
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
			asset: { eTag: exactETag, status: OkResponse.status },
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
					asset: { eTag, status: OkResponse.status },
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
						asset: { eTag, status: NotFoundResponse.status },
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
 * | reserved (sometimes encoded)              | unchanged | encoded              |
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
const decodePath = (pathname: string) => {
	return (
		pathname
			.split("/")
			.map((x) => {
				try {
					const decoded = decodeURIComponent(x);
					return decoded;
				} catch {
					return x;
				}
			})
			.join("/")
			// normalize the path; remove multiple slashes which could lead to same-schema redirects
			.replace(/\/+/g, "/")
	);
};
/**
 * Use the encoded path as the canonical path for sometimes-encoded characters
 * e.g. /[boop] -> /%5Bboop%5D 307
 */
const encodePath = (pathname: string) => {
	return pathname
		.split("/")
		.map((x) => {
			try {
				const encoded = encodeURIComponent(x);
				return encoded;
			} catch {
				return x;
			}
		})
		.join("/");
};
