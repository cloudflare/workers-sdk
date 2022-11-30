import {
	FoundResponse,
	InternalServerErrorResponse,
	MethodNotAllowedResponse,
	MovedPermanentlyResponse,
	NotAcceptableResponse,
	NotFoundResponse,
	NotModifiedResponse,
	OkResponse,
	PermanentRedirectResponse,
	SeeOtherResponse,
	TemporaryRedirectResponse,
} from "./responses";
import { generateRulesMatcher, replacer } from "./rulesEngine";
import { stringifyURLToRootRelativePathname } from "./url";
import type {
	Metadata,
	MetadataHeadersEntries,
	MetadataHeadersRulesV2,
	MetadataHeadersV1,
	MetadataHeadersV2,
	MetadataStaticRedirectEntry,
	MetadataRedirectEntry,
} from "./metadata";

type BodyEncoding = "manual" | "automatic";

// Before serving a 404, we check the cache to see if we've served this asset recently
// and if so, serve it from the cache instead of responding with a 404.
// This gives a bit of a grace period between deployments for any clients browsing the old deployment.
export const ASSET_PRESERVATION_CACHE = "assetPreservationCache";
const CACHE_CONTROL_PRESERVATION = "public, s-maxage=604800"; // 1 week

export const CACHE_CONTROL_BROWSER = "public, max-age=0, must-revalidate"; // have the browser check in with the server to make sure its local cache is valid before using it
export const REDIRECTS_VERSION = 1;
export const HEADERS_VERSION = 2;
export const HEADERS_VERSION_V1 = 1;
export const ANALYTICS_VERSION = 1;

// In rolling this out, we're taking a conservative approach to only generate these Link headers from <link> elements that have these attributes.
// We'll ignore any <link> elements that contain other attributes (e.g. `fetchpriority`, `crossorigin` or `data-please-dont-generate-a-header`).
// We're not confident in browser support for all of these additional attributes, so we'll wait until we have that information before proceeding further.
const ALLOWED_EARLY_HINT_LINK_ATTRIBUTES = ["rel", "as", "href"];

// Takes metadata headers and "normalise" them
// to the latest version
export function normaliseHeaders(
	headers: MetadataHeadersV1 | MetadataHeadersV2
): MetadataHeadersRulesV2 {
	if (headers.version === HEADERS_VERSION) {
		return headers.rules;
	} else if (headers.version === HEADERS_VERSION_V1) {
		return Object.keys(headers.rules).reduce(
			(acc: MetadataHeadersRulesV2, key) => {
				acc[key] = {
					set: headers.rules[key] as MetadataHeadersEntries,
				};
				return acc;
			},
			{}
		);
	} else {
		return {};
	}
}

type FindAssetEntryForPath<AssetEntry> = (
	path: string
) => Promise<null | AssetEntry>;

type ServeAsset<AssetEntry> = (
	assetEntry: AssetEntry,
	options?: { preserve: boolean }
) => Promise<Response>;

type FullHandlerContext<AssetEntry, ContentNegotiation, Asset> = {
	request: Request;
	metadata: Metadata;
	xServerEnvHeader?: string;
	logError: (err: Error) => void;
	findAssetEntryForPath: FindAssetEntryForPath<AssetEntry>;
	getAssetKey(assetEntry: AssetEntry, content: ContentNegotiation): string;
	negotiateContent(
		request: Request,
		assetEntry: AssetEntry
	): ContentNegotiation;
	fetchAsset: (assetKey: string) => Promise<Asset>;
	generateNotFoundResponse?: (
		request: Request,
		findAssetEntryForPath: FindAssetEntryForPath<AssetEntry>,
		serveAsset: ServeAsset<AssetEntry>
	) => Promise<Response>;
	attachAdditionalHeaders?: (
		response: Response,
		content: ContentNegotiation,
		assetEntry: AssetEntry,
		asset: Asset
	) => void;
	caches: CacheStorage;
	waitUntil: (promise: Promise<unknown>) => void;
};

export type HandlerContext<
	AssetEntry,
	ContentNegotiation extends { encoding: string | null } = {
		encoding: string | null;
	},
	Asset extends { body: ReadableStream | null; contentType: string } = {
		body: ReadableStream | null;
		contentType: string;
	}
> =
	| FullHandlerContext<AssetEntry, ContentNegotiation, Asset>
	| (Omit<
			FullHandlerContext<AssetEntry, ContentNegotiation, Asset>,
			"caches" | "waitUntil"
	  > & {
			caches?: undefined;
			waitUntil?: undefined;
	  });

export async function generateHandler<
	AssetEntry,
	ContentNegotiation extends { encoding: string | null } = {
		encoding: string | null;
	},
	Asset extends { body: ReadableStream | null; contentType: string } = {
		body: ReadableStream | null;
		contentType: string;
	}
>({
	request,
	metadata,
	xServerEnvHeader,
	logError,
	findAssetEntryForPath,
	getAssetKey,
	negotiateContent,
	fetchAsset,
	generateNotFoundResponse = async (
		notFoundRequest,
		notFoundFindAssetEntryForPath,
		notFoundServeAsset
	) => {
		let assetEntry: AssetEntry | null;
		// No custom 404 page, so try serving as a single-page app
		if ((assetEntry = await notFoundFindAssetEntryForPath("/index.html"))) {
			return notFoundServeAsset(assetEntry, { preserve: false });
		}

		return new NotFoundResponse();
	},
	attachAdditionalHeaders = () => {},
	caches,
	waitUntil,
}: HandlerContext<AssetEntry, ContentNegotiation, Asset>) {
	const url = new URL(request.url);
	const { protocol, host, search } = url;
	let { pathname } = url;

	const earlyHintsCache = metadata.deploymentId
		? await caches?.open(`eh:${metadata.deploymentId}`)
		: undefined;

	const headerRules = metadata.headers
		? normaliseHeaders(metadata.headers)
		: {};

	const staticRules =
		metadata.redirects?.version === REDIRECTS_VERSION
			? metadata.redirects.staticRules || {}
			: {};

	const staticRedirectsMatcher = () => {
		const withHostMatch = staticRules[`https://${host}${pathname}`];
		const withoutHostMatch = staticRules[pathname];

		if (withHostMatch && withoutHostMatch) {
			if (withHostMatch.lineNumber < withoutHostMatch.lineNumber) {
				return withHostMatch;
			} else {
				return withoutHostMatch;
			}
		}

		return withHostMatch || withoutHostMatch;
	};

	const generateRedirectsMatcher = () =>
		generateRulesMatcher(
			metadata.redirects?.version === REDIRECTS_VERSION
				? metadata.redirects.rules
				: {},
			({ status, to }, replacements) => ({
				status,
				to: replacer(to, replacements),
			})
		);

	let assetEntry: AssetEntry | null;

	async function generateResponse(): Promise<Response> {
		const match =
			staticRedirectsMatcher() || generateRedirectsMatcher()({ request })[0];

		if (match) {
			return getResponseFromMatch(match, url);
		}

		if (!request.method.match(/^(get|head)$/i)) {
			return new MethodNotAllowedResponse();
		}

		try {
			pathname = globalThis.decodeURIComponent(pathname);
		} catch (err) {}

		if (pathname.endsWith("/")) {
			if ((assetEntry = await findAssetEntryForPath(`${pathname}index.html`))) {
				return serveAsset(assetEntry);
			} else if (pathname.endsWith("/index/")) {
				return new PermanentRedirectResponse(
					`/${pathname.slice(1, -"index/".length)}${search}`
				);
			} else if (
				(assetEntry = await findAssetEntryForPath(
					`${pathname.replace(/\/$/, ".html")}`
				))
			) {
				return new PermanentRedirectResponse(
					`/${pathname.slice(1, -1)}${search}`
				);
			} else {
				return notFound();
			}
		}

		if ((assetEntry = await findAssetEntryForPath(pathname))) {
			if (pathname.endsWith(".html")) {
				const extensionlessPath = pathname.slice(0, -".html".length);
				// Don't redirect to an extensionless URL if another asset exists there
				// or if pathname is /.html
				// FIXME: this doesn't handle files in directories ie: /foobar/.html
				if (extensionlessPath.endsWith("/index")) {
					return new PermanentRedirectResponse(
						`${extensionlessPath.replace(/\/index$/, "/")}${search}`
					);
				} else if (
					(await findAssetEntryForPath(extensionlessPath)) ||
					extensionlessPath === "/"
				) {
					return serveAsset(assetEntry);
				} else {
					return new PermanentRedirectResponse(`${extensionlessPath}${search}`);
				}
			} else {
				return serveAsset(assetEntry);
			}
		} else if (pathname.endsWith("/index")) {
			return new PermanentRedirectResponse(
				`/${pathname.slice(1, -"index".length)}${search}`
			);
		} else if ((assetEntry = await findAssetEntryForPath(`${pathname}.html`))) {
			return serveAsset(assetEntry);
		} else if (hasFileExtension(pathname)) {
			return notFound();
		}

		if ((assetEntry = await findAssetEntryForPath(`${pathname}/index.html`))) {
			return new PermanentRedirectResponse(`${pathname}/${search}`);
		} else {
			return notFound();
		}
	}

	async function attachHeaders(response: Response) {
		const existingHeaders = new Headers(response.headers);

		const extraHeaders = new Headers({
			"access-control-allow-origin": "*",
			"referrer-policy": "strict-origin-when-cross-origin",
			...(existingHeaders.has("content-type")
				? { "x-content-type-options": "nosniff" }
				: {}),
		});

		const headers = new Headers({
			// But we intentionally override existing headers
			...Object.fromEntries(existingHeaders.entries()),
			...Object.fromEntries(extraHeaders.entries()),
		});

		if (earlyHintsCache) {
			const preEarlyHintsHeaders = new Headers(headers);

			// "Early Hints cache entries are keyed by request URI and ignore query strings."
			// https://developers.cloudflare.com/cache/about/early-hints/
			const earlyHintsCacheKey = `${protocol}//${host}${pathname}`;
			const earlyHintsResponse = await earlyHintsCache.match(
				earlyHintsCacheKey
			);
			if (earlyHintsResponse) {
				const earlyHintsLinkHeader = earlyHintsResponse.headers.get("Link");
				if (earlyHintsLinkHeader) {
					headers.set("Link", earlyHintsLinkHeader);
				}
			}

			const clonedResponse = response.clone();

			if (waitUntil) {
				waitUntil(
					(async () => {
						try {
							const links: { href: string; rel: string; as?: string }[] = [];

							const transformedResponse = new HTMLRewriter()
								.on("link[rel~=preconnect],link[rel~=preload]", {
									element(element) {
										for (const [attributeName] of element.attributes) {
											if (
												!ALLOWED_EARLY_HINT_LINK_ATTRIBUTES.includes(
													attributeName.toLowerCase()
												)
											) {
												return;
											}
										}

										const href = element.getAttribute("href") || undefined;
										const rel = element.getAttribute("rel") || undefined;
										const as = element.getAttribute("as") || undefined;
										if (href && !href.startsWith("data:") && rel) {
											links.push({ href, rel, as });
										}
									},
								})
								.transform(clonedResponse);

							// Needed to actually execute the HTMLRewriter handlers
							await transformedResponse.text();

							links.forEach(({ href, rel, as }) => {
								let link = `<${href}>; rel="${rel}"`;
								if (as) {
									link += `; as=${as}`;
								}
								preEarlyHintsHeaders.append("Link", link);
							});

							const linkHeader = preEarlyHintsHeaders.get("Link");
							if (linkHeader) {
								await earlyHintsCache.put(
									earlyHintsCacheKey,
									new Response(null, { headers: { Link: linkHeader } })
								);
							}
						} catch (err) {
							// Nbd if we fail here in the deferred 'waitUntil' work. We're probably trying to parse a malformed page or something.
							// Totally fine to skip over any errors.
							// If we need to debug something, you can uncomment the following:
							// logError(err)
						}
					})()
				);
			}
		}

		// Iterate through rules and find rules that match the path
		const headersMatcher = generateRulesMatcher(
			headerRules,
			({ set = {}, unset = [] }, replacements) => {
				const replacedSet: Record<string, string> = {};
				Object.keys(set).forEach((key) => {
					replacedSet[key] = replacer(set[key], replacements);
				});
				return {
					set: replacedSet,
					unset,
				};
			}
		);
		const matches = headersMatcher({ request });

		// This keeps track of every header that we've set from _headers
		// because we want to combine user declared headers but overwrite
		// existing and extra ones
		const setMap = new Set();
		// Apply every matched rule in order
		matches.forEach(({ set = {}, unset = [] }) => {
			unset.forEach((key) => {
				headers.delete(key);
			});
			Object.keys(set).forEach((key) => {
				if (setMap.has(key.toLowerCase())) {
					headers.append(key, set[key]);
				} else {
					headers.set(key, set[key]);
					setMap.add(key.toLowerCase());
				}
			});
		});

		// https://fetch.spec.whatwg.org/#null-body-status
		return new Response(
			[101, 204, 205, 304].includes(response.status) ? null : response.body,
			{
				headers: headers,
				status: response.status,
				statusText: response.statusText,
			}
		);
	}

	return await attachHeaders(await generateResponse());

	async function serveAsset(
		servingAssetEntry: AssetEntry,
		options = { preserve: true }
	): Promise<Response> {
		let content: ContentNegotiation;
		try {
			content = negotiateContent(request, servingAssetEntry);
		} catch (err) {
			return new NotAcceptableResponse();
		}

		const assetKey = getAssetKey(servingAssetEntry, content);

		// https://support.cloudflare.com/hc/en-us/articles/218505467-Using-ETag-Headers-with-Cloudflare
		// We sometimes remove etags unless they are wrapped in quotes
		const etag = `"${assetKey}"`;
		const weakEtag = `W/${etag}`;

		const ifNoneMatch = request.headers.get("if-none-match");

		// We sometimes downgrade strong etags to a weak ones, so we need to check for both
		if (ifNoneMatch === weakEtag || ifNoneMatch === etag) {
			return new NotModifiedResponse();
		}

		try {
			const asset = await fetchAsset(assetKey);
			const headers: Record<string, string> = {
				etag,
				"content-type": asset.contentType,
			};
			let encodeBody: BodyEncoding = "automatic";

			if (xServerEnvHeader) {
				headers["x-server-env"] = xServerEnvHeader;
			}

			if (content.encoding) {
				encodeBody = "manual";
				headers["cache-control"] = "no-transform";
				headers["content-encoding"] = content.encoding;
			}

			const response = new OkResponse(
				request.method === "HEAD" ? null : asset.body,
				{
					headers,
					encodeBody,
				}
			);

			if (isCacheable(request)) {
				response.headers.append("cache-control", CACHE_CONTROL_BROWSER);
			}

			attachAdditionalHeaders(response, content, servingAssetEntry, asset);

			if (isPreview(new URL(request.url))) {
				response.headers.set("x-robots-tag", "noindex");
			}

			if (options.preserve) {
				// https://fetch.spec.whatwg.org/#null-body-status
				const preservedResponse = new Response(
					[101, 204, 205, 304].includes(response.status)
						? null
						: response.clone().body,
					response
				);
				preservedResponse.headers.set(
					"cache-control",
					CACHE_CONTROL_PRESERVATION
				);
				preservedResponse.headers.set("x-robots-tag", "noindex");

				if (waitUntil && caches) {
					waitUntil(
						caches
							.open(ASSET_PRESERVATION_CACHE)
							.then((assetPreservationCache) =>
								assetPreservationCache.put(request.url, preservedResponse)
							)
							.catch((err) => {
								logError(err);
							})
					);
				}
			}

			if (
				asset.contentType.startsWith("text/html") &&
				metadata.analytics?.version === ANALYTICS_VERSION
			) {
				return new HTMLRewriter()
					.on("body", {
						element(e) {
							e.append(
								`<!-- Cloudflare Pages Analytics --><script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "${metadata.analytics?.token}"}'></script><!-- Cloudflare Pages Analytics -->`,
								{ html: true }
							);
						},
					})
					.transform(response);
			}

			return response;
		} catch (err) {
			logError(err as Error);
			return new InternalServerErrorResponse(err as Error);
		}
	}

	async function notFound(): Promise<Response> {
		if (caches) {
			const assetPreservationCache = await caches.open(
				ASSET_PRESERVATION_CACHE
			);
			const preservedResponse = await assetPreservationCache.match(request.url);
			if (preservedResponse) {
				return preservedResponse;
			}
		}

		// Traverse upwards from the current path looking for a custom 404 page
		let cwd = pathname;
		while (cwd) {
			cwd = cwd.slice(0, cwd.lastIndexOf("/"));

			if ((assetEntry = await findAssetEntryForPath(`${cwd}/404.html`))) {
				let content: ContentNegotiation;
				try {
					content = negotiateContent(request, assetEntry);
				} catch (err) {
					return new NotAcceptableResponse();
				}

				const assetKey = getAssetKey(assetEntry, content);

				try {
					const { body, contentType } = await fetchAsset(assetKey);
					const response = new NotFoundResponse(body);
					response.headers.set("content-type", contentType);
					return response;
				} catch (err) {
					logError(err as Error);
					return new InternalServerErrorResponse(err as Error);
				}
			}
		}

		return await generateNotFoundResponse(
			request,
			findAssetEntryForPath,
			serveAsset
		);
	}
}

/**
 * Given a redirect match and the request URL, returns the response
 * for the redirect. This function will convert the Location header
 * to be a root-relative path URL if the request origin and destination
 * origins are the same. This is so that if the project is served
 * on multiple domains, the redirects won't take the client off of their current domain.
 */
export function getResponseFromMatch(
	{
		status,
		to,
	}: Pick<MetadataStaticRedirectEntry | MetadataRedirectEntry, "status" | "to">,
	requestUrl: URL
) {
	// Inherit origin from the request URL if not specified in _redirects
	const destination = new URL(to, requestUrl);
	// If _redirects doesn't specify a search, inherit from the request
	destination.search = destination.search || requestUrl.search;

	// If the redirect destination origin matches the incoming request origin
	// we stringify destination to be a root-relative path, e.g.:
	//   https://example.com/foo/bar?baz=1 -> /foo/bar/?baz=1
	// This way, the project can more easily be hosted on multiple domains
	const location =
		destination.origin === requestUrl.origin
			? stringifyURLToRootRelativePathname(destination)
			: destination.toString();

	switch (status) {
		case 301:
			return new MovedPermanentlyResponse(location);
		case 303:
			return new SeeOtherResponse(location);
		case 307:
			return new TemporaryRedirectResponse(location);
		case 308:
			return new PermanentRedirectResponse(location);
		case 302:
		default:
			return new FoundResponse(location);
	}
}

// Parses a list such as "deflate, gzip;q=1.0, *;q=0.5" into
//   {deflate: 1, gzip: 1, *: 0.5}
export function parseQualityWeightedList(list = "") {
	const items: Record<string, number> = {};
	list
		.replace(/\s/g, "")
		.split(",")
		.forEach((el) => {
			const [item, weight] = el.split(";q=");
			items[item] = weight ? parseFloat(weight) : 1;
		});

	return items;
}

function isCacheable(request: Request) {
	return !request.headers.has("authorization") && !request.headers.has("range");
}

function hasFileExtension(path: string) {
	return /\/.+\.[a-z0-9]+$/i.test(path);
}

// Parses a request URL hostname to determine if the request
// is from a project served in "preview" mode.
function isPreview(url: URL): boolean {
	if (url.hostname.endsWith(".pages.dev")) {
		return url.hostname.split(".").length > 3 ? true : false;
	}
	return false;
}
