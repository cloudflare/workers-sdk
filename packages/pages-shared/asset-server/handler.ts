import {
	generateRulesMatcher,
	replacer,
} from "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine";
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
import type {
	Metadata,
	MetadataHeadersEntries,
	MetadataHeadersRulesV2,
	MetadataHeadersV1,
	MetadataHeadersV2,
} from "./metadata";

type BodyEncoding = "manual" | "automatic";

// Before serving a 404, we check the cache to see if we've served this asset recently
// and if so, serve it from the cache instead of responding with a 404.
// This gives a bit of a grace period between deployments for any clients browsing the old deployment.
// Only the content hash is actually stored in the body.
export const ASSET_PRESERVATION_CACHE = "assetPreservationCacheV2";
const CACHE_CONTROL_PRESERVATION = "public, s-maxage=604800"; // 1 week

/** The preservation cache should be periodically
 * written to so that the age / expiration is reset.
 * Note: Up to 12 hours of jitter added to this value.
 */
export const CACHE_PRESERVATION_WRITE_FREQUENCY = 86_400; // 1 day

export const CACHE_CONTROL_BROWSER = "public, max-age=0, must-revalidate"; // have the browser check in with the server to make sure its local cache is valid before using it
export const REDIRECTS_VERSION = 1;
export const HEADERS_VERSION = 2;
export const HEADERS_VERSION_V1 = 1;
export const ANALYTICS_VERSION = 1;

// In rolling this out, we're taking a conservative approach to only generate these Link headers from <link> elements that have these attributes.
// We'll ignore any <link> elements that contain other attributes (e.g. `fetchpriority`, `crossorigin` or `data-please-dont-generate-a-header`).
// We're not confident in browser support for all of these additional attributes, so we'll wait until we have that information before proceeding further.
const ALLOWED_EARLY_HINT_LINK_ATTRIBUTES = ["rel", "as", "href"];

/**
 * Decodes HTML entities in a string.
 * HTMLRewriter's getAttribute() returns raw attribute values without decoding
 * HTML entities like &amp;, &lt;, etc. This function decodes them to their
 * actual characters.
 */
export function decodeHtmlEntities(str: string): string {
	const namedEntities: Record<string, string> = {
		"&amp;": "&",
		"&lt;": "<",
		"&gt;": ">",
		"&quot;": '"',
		"&#39;": "'",
		"&apos;": "'",
	};

	return (
		str
			// Handle named entities (case-insensitive)
			.replace(
				/&(amp|lt|gt|quot|apos|#39);/gi,
				(match) => namedEntities[match.toLowerCase()] || match
			)
			// Handle decimal numeric entities like &#38;
			.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
			// Handle hexadecimal numeric entities like &#x26;
			.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
				String.fromCharCode(parseInt(hex, 16))
			)
	);
}

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

function generateETagHeader(assetKey: string) {
	// https://support.cloudflare.com/hc/en-us/articles/218505467-Using-ETag-Headers-with-Cloudflare
	// We sometimes remove etags unless they are wrapped in quotes
	const strongETag = `"${assetKey}"`;
	const weakETag = `W/"${assetKey}"`;
	return { strongETag, weakETag };
}

function checkIfNoneMatch(
	request: Request,
	strongETag: string,
	weakETag: string
) {
	const ifNoneMatch = request.headers.get("if-none-match");

	// We sometimes downgrade strong etags to a weak ones, so we need to check for both
	return ifNoneMatch === weakETag || ifNoneMatch === strongETag;
}

type ServeAsset<AssetEntry> = (
	assetEntry: AssetEntry,
	options?: { preserve: boolean }
) => Promise<Response>;

type CacheStatus = "hit" | "miss";
type CacheResult<A extends string> = `${A}-${CacheStatus}`;
export type HandlerMetrics = {
	preservationCacheResult?:
		| CacheResult<"checked">
		| "not-modified"
		| "disabled";
	earlyHintsResult?: CacheResult<"used" | "notused"> | "disabled";
};

type FullHandlerContext<AssetEntry, ContentNegotiation, Asset> = {
	request: Request;
	metadata: Metadata;
	xServerEnvHeader?: string;
	xDeploymentIdHeader?: boolean;
	xWebAnalyticsHeader?: boolean;
	logError: (err: Error) => void;
	setMetrics?: (metrics: HandlerMetrics) => void;
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

export type HandlerContext<AssetEntry, ContentNegotiation, Asset> =
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
	},
>({
	request,
	metadata,
	xServerEnvHeader,
	xDeploymentIdHeader,
	xWebAnalyticsHeader,
	logError,
	setMetrics,
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
			if (match.status === 200) {
				// A 200 redirect means that we are proxying to a different asset, for example,
				// a request with url /users/12345 could be pointed to /users/id.html. In order to
				// do this, we overwrite the pathname, and instead match for assets with that url,
				// and importantly, do not use the regular redirect handler - as the url visible to
				// the user does not change
				pathname = new URL(match.to, request.url).pathname;
			} else {
				const { status, to } = match;
				const destination = new URL(to, request.url);
				const location =
					destination.origin === new URL(request.url).origin
						? `${destination.pathname}${destination.search || search}${
								destination.hash
							}`
						: `${destination.href.slice(0, destination.href.length - (destination.search.length + destination.hash.length))}${
								destination.search ? destination.search : search
							}${destination.hash}`;

				switch (status) {
					case 301:
						return new MovedPermanentlyResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 303:
						return new SeeOtherResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 307:
						return new TemporaryRedirectResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 308:
						return new PermanentRedirectResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
					case 302:
					default:
						return new FoundResponse(location, undefined, {
							preventLeadingDoubleSlash: false,
						});
				}
			}
		}

		if (!request.method.match(/^(get|head)$/i)) {
			return new MethodNotAllowedResponse();
		}

		try {
			pathname = globalThis.decodeURIComponent(pathname);
		} catch {}

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
		}

		if ((assetEntry = await findAssetEntryForPath(`${pathname}/index.html`))) {
			return new PermanentRedirectResponse(`${pathname}/${search}`);
		} else {
			return notFound();
		}
	}

	function isNullBodyStatus(status: number): boolean {
		return [101, 204, 205, 304].includes(status);
	}

	async function attachHeaders(response: Response) {
		const existingHeaders = new Headers(response.headers);
		const eTag = existingHeaders.get("eTag")?.match(/^"(.*)"$/)?.[1];

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

		if (
			earlyHintsCache &&
			isHTMLContentType(response.headers.get("Content-Type")) &&
			eTag
		) {
			const preEarlyHintsHeaders = new Headers(headers);

			// "Early Hints cache entries are keyed by request URI and ignore query strings."
			// https://developers.cloudflare.com/cache/about/early-hints/
			const earlyHintsCacheKey = `${protocol}//${host}/${eTag}`;
			const earlyHintsResponse =
				await earlyHintsCache.match(earlyHintsCacheKey);
			if (earlyHintsResponse) {
				const earlyHintsLinkHeader = earlyHintsResponse.headers.get("Link");
				if (earlyHintsLinkHeader) {
					headers.set("Link", earlyHintsLinkHeader);
					if (setMetrics) {
						setMetrics({ earlyHintsResult: "used-hit" });
					}
				} else {
					if (setMetrics) {
						setMetrics({ earlyHintsResult: "notused-hit" });
					}
				}
			} else {
				if (setMetrics) {
					setMetrics({ earlyHintsResult: "notused-miss" });
				}

				const clonedResponse = response.clone();

				if (waitUntil) {
					waitUntil(
						(async () => {
							try {
								const links: { href: string; rel: string; as?: string }[] = [];

								const transformedResponse = new HTMLRewriter()
									.on(
										"link[rel~=preconnect],link[rel~=preload],link[rel~=modulepreload]",
										{
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

												const rawHref =
													element.getAttribute("href") || undefined;
												const href = rawHref
													? decodeHtmlEntities(rawHref)
													: undefined;
												const rel = element.getAttribute("rel") || undefined;
												const as = element.getAttribute("as") || undefined;
												if (href && !href.startsWith("data:") && rel) {
													links.push({ href, rel, as });
												}
											},
										}
									)
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
								const earlyHintsHeaders = new Headers({
									"Cache-Control": "max-age=2592000", // 30 days
								});
								if (linkHeader) {
									earlyHintsHeaders.append("Link", linkHeader);
								}
								await earlyHintsCache.put(
									earlyHintsCacheKey,
									new Response(null, { headers: earlyHintsHeaders })
								);
							} catch {
								// Nbd if we fail here in the deferred 'waitUntil' work. We're probably trying to parse a malformed page or something.
								// Totally fine to skip over any errors.
								// If we need to debug something, you can uncomment the following:
								// logError(err)
								// In any case, let's not bother checking again for another day.
								await earlyHintsCache.put(
									earlyHintsCacheKey,
									new Response(null, {
										headers: {
											"Cache-Control": "max-age=86400", // 1 day
										},
									})
								);
							}
						})()
					);
				}
			}
		} else {
			if (setMetrics) {
				setMetrics({ earlyHintsResult: "disabled" });
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
			isNullBodyStatus(response.status) ? null : response.body,
			{
				headers: headers,
				status: response.status,
				statusText: response.statusText,
			}
		);
	}

	const responseWithoutHeaders = await generateResponse();
	if (responseWithoutHeaders.status >= 500) {
		return responseWithoutHeaders;
	}

	const responseWithHeaders = await attachHeaders(responseWithoutHeaders);
	if (responseWithHeaders.status === 404) {
		// Remove any user-controlled cache-control headers
		// This is to prevent the footgun of potentionally caching this 404 for a long time
		if (responseWithHeaders.headers.has("cache-control")) {
			responseWithHeaders.headers.delete("cache-control");
		}
		// Add cache-control: no-store to prevent this from being cached on the responding zones.
		responseWithHeaders.headers.append("cache-control", "no-store");
	}

	return responseWithHeaders;

	async function serveAsset(
		servingAssetEntry: AssetEntry,
		options = { preserve: true }
	): Promise<Response> {
		let content: ContentNegotiation;
		try {
			content = negotiateContent(request, servingAssetEntry);
		} catch {
			return new NotAcceptableResponse();
		}

		const assetKey = getAssetKey(servingAssetEntry, content);

		const { strongETag, weakETag } = generateETagHeader(assetKey);
		const isIfNoneMatch = checkIfNoneMatch(request, strongETag, weakETag);
		if (isIfNoneMatch) {
			return new NotModifiedResponse();
		}

		try {
			const asset = await fetchAsset(assetKey);
			const headers: Record<string, string> = {
				etag: strongETag,
				"content-type": asset.contentType,
			};
			let encodeBody: BodyEncoding = "automatic";

			if (xServerEnvHeader) {
				headers["x-server-env"] = xServerEnvHeader;
			}

			if (xDeploymentIdHeader && metadata.deploymentId) {
				headers["x-deployment-id"] = metadata.deploymentId;
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

			if (options.preserve && waitUntil && caches) {
				waitUntil(
					(async () => {
						try {
							const assetPreservationCache = await caches.open(
								ASSET_PRESERVATION_CACHE
							);

							// Check if the asset has changed since last written to cache
							// or if the cached entry is getting too old and should have
							// it's expiration reset.
							const match = await assetPreservationCache.match(request);
							if (
								!match ||
								assetKey !== (await match.text()) ||
								isPreservationCacheResponseExpiring(match)
							) {
								// cache the asset key in the cache with all the headers.
								// When we read it back, we'll re-fetch the body but use the
								// cached headers.
								const preservedResponse = new Response(assetKey, response);
								preservedResponse.headers.set(
									"cache-control",
									CACHE_CONTROL_PRESERVATION
								);
								preservedResponse.headers.set("x-robots-tag", "noindex");

								await assetPreservationCache.put(
									request.url,
									preservedResponse
								);
							}
						} catch (err) {
							logError(err as Error);
						}
					})()
				);
			}

			if (
				isHTMLContentType(asset.contentType) &&
				metadata.analytics?.version === ANALYTICS_VERSION
			) {
				if (xWebAnalyticsHeader) {
					response.headers.set("x-cf-pages-analytics", "1");
				}
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
			try {
				const assetPreservationCache = await caches.open(
					ASSET_PRESERVATION_CACHE
				);
				const preservedResponse = await assetPreservationCache.match(
					request.url
				);

				// V2 cache only contains the asset key, rather than the asset body:
				if (preservedResponse) {
					if (setMetrics) {
						setMetrics({ preservationCacheResult: "checked-hit" });
					}
					// Always read the asset key to prevent hanging responses
					const assetKey = await preservedResponse.text();
					if (isNullBodyStatus(preservedResponse.status)) {
						// We know the asset hasn't changed, so use the cached headers.
						return new Response(null, preservedResponse);
					}
					if (assetKey) {
						const { strongETag, weakETag } = generateETagHeader(assetKey);
						const isIfNoneMatch = checkIfNoneMatch(
							request,
							strongETag,
							weakETag
						);
						if (isIfNoneMatch) {
							if (setMetrics) {
								setMetrics({ preservationCacheResult: "not-modified" });
							}
							return new NotModifiedResponse();
						}

						const asset = await fetchAsset(assetKey);

						if (asset) {
							// We know the asset hasn't changed, so use the cached headers.
							return new Response(asset.body, preservedResponse);
						} else {
							logError(
								new Error(
									`preservation cache contained assetKey that does not exist in storage: ${assetKey}`
								)
							);
						}
					} else {
						logError(new Error(`cached response had no assetKey: ${assetKey}`));
					}
				} else {
					if (setMetrics) {
						setMetrics({ preservationCacheResult: "checked-miss" });
					}
				}
			} catch (err) {
				// Don't throw an error because preservation cache is best effort.
				// But log it because we should be able to fetch the asset here.
				logError(err as Error);
			}
		} else {
			if (setMetrics) {
				setMetrics({ preservationCacheResult: "disabled" });
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
				} catch {
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

// Parses a request URL hostname to determine if the request
// is from a project served in "preview" mode.
function isPreview(url: URL): boolean {
	if (url.hostname.endsWith(".pages.dev")) {
		return url.hostname.split(".").length > 3 ? true : false;
	}
	return false;
}

/** Checks if a response is older than CACHE_PRESERVATION_WRITE_FREQUENCY
 * and should be written to cache again to reset it's expiration.
 */
export function isPreservationCacheResponseExpiring(
	response: Response
): boolean {
	const ageHeader = response.headers.get("age");
	if (!ageHeader) {
		return false;
	}
	try {
		const age = parseInt(ageHeader);
		// Add up to 12 hours of jitter to help prevent a
		// thundering heard when a lot of assets expire at once.
		const jitter = Math.floor(Math.random() * 43_200);
		if (age > CACHE_PRESERVATION_WRITE_FREQUENCY + jitter) {
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

/**
 * Whether or not the passed in string looks like an HTML
 * Content-Type header
 */
function isHTMLContentType(contentType?: string | null) {
	return contentType?.toLowerCase().startsWith("text/html") || false;
}
