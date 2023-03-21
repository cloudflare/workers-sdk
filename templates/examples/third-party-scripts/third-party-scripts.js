/**
 * Definitions for content to self-host.
 */

const SCRIPT_URLS = [
	// Hosted libraries (usually CDN's for open source).
	"/ajax.aspnetcdn.com/",
	"/ajax.cloudflare.com/",
	"/ajax.googleapis.com/ajax/",
	"/cdn.jsdelivr.net/",
	"/cdnjs.com/",
	"/cdnjs.cloudflare.com/",
	"/code.jquery.com/",
	"/maxcdn.bootstrapcdn.com/",
	"/netdna.bootstrapcdn.com/",
	"/oss.maxcdn.com/",
	"/stackpath.bootstrapcdn.com/",

	// Popular scripts (can be site-specific)
	"/a.optmnstr.com/app/js/",
	"/cdn.onesignal.com/sdks/",
	"/cdn.optimizely.com/",
	"/cdn.shopify.com/s/",
	"/css3-mediaqueries-js.googlecode.com/svn/",
	"/html5shim.googlecode.com/svn/",
	"/html5shiv.googlecode.com/svn/",
	"/maps.google.com/maps/api/js",
	"/maps.googleapis.com/maps/api/js",
	"/pagead2.googlesyndication.com/pagead/js/",
	"/platform.twitter.com/widgets.js",
	"/platform-api.sharethis.com/js/",
	"/s7.addthis.com/js/",
	"/stats.wp.com/",
	"/ws.sharethis.com/button/",
	"/www.google.com/recaptcha/api.js",
	"/www.google-analytics.com/analytics.js",
	"/www.googletagmanager.com/gtag/js",
	"/www.googletagmanager.com/gtm.js",
	"/www.googletagservices.com/tag/js/gpt.js",
];

// Regex patterns for matching script and link tags
const SCRIPT_PRE = "<\\s*script[^>]+src\\s*=\\s*['\"]\\s*((https?:)?/";
const PATTERN_POST = "[^'\" ]+)\\s*[\"'][^>]*>";

/**
 * Main worker entry point. Looks for font requests that are being proxied and
 * requests for HTML content. All major browsers explicitly send an accept: text/html
 * for navigational requests and the fallback is to just pass the request through
 * unmodified (safe).
 */
export default {
	async fetch(request, env, ctx) {
		ctx.passThroughOnException();

		const url = new URL(request.url);
		const bypass =
			new URL(request.url).searchParams.get("cf-worker") === "bypass";
		if (!bypass) {
			let accept = request.headers.get("accept");
			if (request.method === "GET" && isProxyRequest(url)) {
				ctx.respondWith(proxyUrl(url, request));
			} else if (accept && accept.indexOf("text/html") >= 0) {
				ctx.respondWith(processHtmlRequest(request));
			}
		}
	},
};

// Workers can only decode utf-8 so keep a list of character encodings that can be decoded.
const VALID_CHARSETS = ["utf-8", "utf8", "iso-8859-1", "us-ascii"];

/**
 * See if the requested resource is a proxy request to an overwritten origin
 * (something that starts with a prefix in one of our lists).
 *
 * @param {*} url - Requested URL
 * @param {*} request - Original Request
 * @returns {*} - true if the URL matches one of the proxy paths
 */
function isProxyRequest(url) {
	let found_prefix = false;
	const path = url.pathname + url.search;
	for (let prefix of SCRIPT_URLS) {
		if (path.startsWith(prefix) && path.indexOf("cf_hash=") >= 0) {
			found_prefix = true;
			break;
		}
	}
	return found_prefix;
}

/**
 * Generate a new request based on the original. Filter the request
 * headers to prevent leaking user data (cookies, etc) and filter
 * the response headers to prevent the origin setting policy on
 * our origin.
 *
 * @param {URL} url - Unmodified request URL
 * @param {*} request - The original request
 * @returns {*} - fetch response
 */
async function proxyUrl(url, request) {
	let originUrl = "https:/" + url.pathname + url.search;
	let hashOffset = originUrl.indexOf("cf_hash=");
	if (hashOffset >= 2) {
		originUrl = originUrl.substring(0, hashOffset - 1);
	}

	// Filter the request headers
	let init = {
		method: request.method,
		headers: {},
	};
	const proxy_headers = [
		"Accept",
		"Accept-Encoding",
		"Accept-Language",
		"Referer",
		"User-Agent",
	];
	for (let name of proxy_headers) {
		let value = request.headers.get(name);
		if (value) {
			init.headers[name] = value;
		}
	}
	// Add an X-Forwarded-For with the client IP
	const clientAddr = request.headers.get("cf-connecting-ip");
	if (clientAddr) {
		init.headers["X-Forwarded-For"] = clientAddr;
	}

	// Filter the response headers
	const response = await fetch(originUrl, init);
	if (response) {
		const responseHeaders = [
			"Content-Type",
			"Cache-Control",
			"Expires",
			"Accept-Ranges",
			"Date",
			"Last-Modified",
			"ETag",
		];
		let responseInit = {
			status: response.status,
			statusText: response.statusText,
			headers: {},
		};
		for (let name of responseHeaders) {
			let value = response.headers.get(name);
			if (value) {
				responseInit.headers[name] = value;
			}
		}
		// Extend the cache time for successful responses (since the url is
		// specific to the hashed content).
		if (response.status === 200) {
			responseInit.headers["Cache-Control"] = "private; max-age=315360000";
		}

		const newResponse = new Response(response.body, responseInit);
		return newResponse;
	}

	return response;
}

/**
 * Handle all of the processing for a (likely) HTML request.
 * - Pass through the request to the origin and inspect the response.
 * - If the response is HTML set up a streaming transform and pass it on to modifyHtmlStream for processing
 *
 * Extra care needs to be taken to make sure the character encoding from the original
 * HTML is extracted and converted to utf-8 and that the downstream response is identified
 * as utf-8.
 *
 * @param {*} request - The original request
 */
async function processHtmlRequest(request) {
	// Fetch from origin server.
	const response = await fetch(request);
	let contentType = response.headers.get("content-type");
	if (contentType && contentType.indexOf("text/html") !== -1) {
		// Workers can only decode utf-8. If it is anything else, pass the
		// response through unmodified
		const charsetRegex = /charset\s*=\s*([^\s;]+)/gim;
		const match = charsetRegex.exec(contentType);
		if (match !== null) {
			let charset = match[1].toLowerCase();
			if (!VALID_CHARSETS.includes(charset)) {
				return response;
			}
		}

		// Create an identity TransformStream (a.k.a. a pipe).
		// The readable side will become our new response body.
		const { readable, writable } = new TransformStream();

		// Create a cloned response with our modified stream and content type header
		const newResponse = new Response(readable, response);

		// Start the async processing of the response stream (don't wait for it to finish)
		modifyHtmlStream(response.body, writable, request);

		// Return the in-process response so it can be streamed.
		return newResponse;
	} else {
		return response;
	}
}

/**
 * Check to see if the HTML chunk includes a meta tag for an unsupported charset
 * @param {*} chunk - Chunk of HTML to scan
 * @returns {bool} - true if the HTML chunk includes a meta tag for an unsupported charset
 */
function chunkContainsInvalidCharset(chunk) {
	let invalid = false;

	// meta charset
	const charsetRegex = /<\s*meta[^>]+charset\s*=\s*['"]([^'"]*)['"][^>]*>/gim;
	const charsetMatch = charsetRegex.exec(chunk);
	if (charsetMatch) {
		const docCharset = charsetMatch[1].toLowerCase();
		if (!VALID_CHARSETS.includes(docCharset)) {
			invalid = true;
		}
	}
	// content-type
	const contentTypeRegex =
		/<\s*meta[^>]+http-equiv\s*=\s*['"]\s*content-type[^>]*>/gim;
	const contentTypeMatch = contentTypeRegex.exec(chunk);
	if (contentTypeMatch) {
		const metaTag = contentTypeMatch[0];
		const metaRegex = /charset\s*=\s*([^\s"]*)/gim;
		const metaMatch = metaRegex.exec(metaTag);
		if (metaMatch) {
			const charset = metaMatch[1].toLowerCase();
			if (!VALID_CHARSETS.includes(charset)) {
				invalid = true;
			}
		}
	}
	return invalid;
}

/**
 * Process the streaming HTML response from the origin server.
 * - Attempt to buffer the full head to reduce the likelihood of the patterns spanning multiple response chunks
 * - Scan the first response chunk for a charset meta tag (and bail if it isn't a supported charset)
 * - Pass the gathered head and each subsequent chunk to modifyHtmlChunk() for actual processing of the text.
 *
 * @param {*} readable - Input stream (from the origin).
 * @param {*} writable - Output stream (to the browser).
 * @param {*} request - Original request object for downstream use.
 */
async function modifyHtmlStream(readable, writable, request) {
	const reader = readable.getReader();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();
	let decoder = new TextDecoder("utf-8", { fatal: true });

	let firstChunk = true;
	let unsupportedCharset = false;

	// build the list of url patterns we are going to look for.
	let patterns = [];
	for (let scriptUrl of SCRIPT_URLS) {
		let regex = new RegExp(SCRIPT_PRE + scriptUrl + PATTERN_POST, "gi");
		patterns.push(regex);
	}

	let partial = "";
	let content = "";

	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			if (partial.length) {
				partial = await modifyHtmlChunk(partial, patterns, request);
				await writer.write(encoder.encode(partial));
			}
			partial = "";
			break;
		}

		let chunk = null;
		if (unsupportedCharset) {
			// Pass the data straight through
			await writer.write(value);
			continue;
		} else {
			try {
				chunk = decoder.decode(value, { stream: true });
			} catch (e) {
				// Decoding failed, switch to passthrough
				unsupportedCharset = true;
				if (partial.length) {
					await writer.write(encoder.encode(partial));
					partial = "";
				}
				await writer.write(value);
				continue;
			}
		}

		try {
			// Look inside of the first chunk for a HTML charset or content-type meta tag.
			if (firstChunk) {
				firstChunk = false;
				if (chunkContainsInvalidCharset(chunk)) {
					// switch to passthrough
					unsupportedCharset = true;
					if (partial.length) {
						await writer.write(encoder.encode(partial));
						partial = "";
					}
					await writer.write(value);
					continue;
				}
			}

			// TODO: Optimize this so we aren't continuously adding strings together
			content = partial + chunk;
			partial = "";

			// See if there is an unclosed script tag at the end (and if so, carve
			// it out to complete when the remainder comes in).
			// This isn't perfect (case sensitive and doesn't allow whitespace in the tag)
			// but it is good enough for our purpose and much faster than a regex.
			const scriptPos = content.lastIndexOf("<script");
			if (scriptPos >= 0) {
				const scriptClose = content.indexOf(">", scriptPos);
				if (scriptClose === -1) {
					partial = content.slice(scriptPos);
					content = content.slice(0, scriptPos);
				}
			}

			if (content.length) {
				content = await modifyHtmlChunk(content, patterns, request);
			}
		} catch (e) {
			// Ignore the exception
		}
		if (content.length) {
			await writer.write(encoder.encode(content));
			content = "";
		}
	}
	await writer.close();
}

/**
 * Find any of the script tags we are looking for and replace them with hashed versions
 * that are proxied through the origin.
 *
 * @param {*} content - Text chunk from the streaming HTML (or accumulated head)
 * @param {*} patterns - RegEx patterns to match
 * @param {*} request - Original request object for downstream use.
 */
async function modifyHtmlChunk(content, patterns, request) {
	// Fully tokenizing and parsing the HTML is expensive.  This regex is much faster and should be reasonably safe.
	// It looks for the search patterns and extracts the URL as match #1.  It shouldn't match
	// in-text content because the < > brackets would be escaped in the HTML.  There is some potential risk of
	// matching it in an inline script (unlikely but possible).
	const pageUrl = new URL(request.url);
	for (let pattern of patterns) {
		let match = pattern.exec(content);
		while (match !== null) {
			const originalUrl = match[1];
			let fetchUrl = originalUrl;
			if (fetchUrl.startsWith("//")) {
				fetchUrl = pageUrl.protocol + fetchUrl;
			}
			const proxyUrl = await hashContent(originalUrl, fetchUrl, request);
			if (proxyUrl) {
				content = content.split(originalUrl).join(proxyUrl);
				pattern.lastIndex -= originalUrl.length - proxyUrl.length;
			}
			match = pattern.exec(content);
		}
	}
	return content;
}

/**
 * Fetch the original content and return a hash of the result (for detecting changes).
 * Use a local cache because some scripts use cache-control: private to prevent
 * proxies from caching.
 *
 * @param {*} originalUrl - Unmodified URL
 * @param {*} url - URL for the third-party request
 * @param {*} request - Original request for the page HTML so the user-agent can be passed through
 */
async function hashContent(originalUrl, url, request) {
	let proxyUrl = null;
	let hash = null;
	const userAgent = request.headers.get("user-agent");
	const clientAddr = request.headers.get("cf-connecting-ip");
	const hashCacheKey = new Request(url + "cf-hash-key");
	let cache = null;

	let foundInCache = false;
	// Try pulling it from the cache API (wrap it in case it's not implemented)
	try {
		cache = caches.default;
		let response = await cache.match(hashCacheKey);
		if (response) {
			hash = await response.text();
			proxyUrl = constructProxyUrl(originalUrl, hash);
			foundInCache = true;
		}
	} catch (e) {
		// Ignore the exception
	}

	if (!foundInCache) {
		try {
			let headers = { Referer: request.url, "User-Agent": userAgent };
			if (clientAddr) {
				headers["X-Forwarded-For"] = clientAddr;
			}
			const response = await fetch(url, { headers: headers });
			let content = await response.arrayBuffer();
			if (content) {
				const hashBuffer = await crypto.subtle.digest("SHA-1", content);
				hash = hex(hashBuffer);
				proxyUrl = constructProxyUrl(originalUrl, hash);

				// Add the hash to the local cache
				try {
					if (cache) {
						let ttl = 60;
						const cacheControl = response.headers.get("cache-control");
						const maxAgeRegex = /max-age\s*=\s*(\d+)/i;
						const match = maxAgeRegex.exec(cacheControl);
						if (match) {
							ttl = parseInt(match[1], 10);
						}
						const hashCacheResponse = new Response(hash, { ttl: ttl });
						cache.put(hashCacheKey, hashCacheResponse);
					}
				} catch (e) {
					// Ignore the exception
				}
			}
		} catch (e) {
			// Ignore the exception
		}
	}

	return proxyUrl;
}

/**
 * Generate the proxy URL given the content hash and base URL
 * @param {*} originalUrl - Original URL
 * @param {*} hash - Hash of content
 * @returns {*} - URL with content hash appended
 */
function constructProxyUrl(originalUrl, hash) {
	let proxyUrl = null;
	let pathStart = originalUrl.indexOf("//");
	if (pathStart >= 0) {
		proxyUrl = originalUrl.substring(pathStart + 1);
		if (proxyUrl.indexOf("?") >= 0) {
			proxyUrl += "&";
		} else {
			proxyUrl += "?";
		}
		proxyUrl += "cf_hash=" + hash;
	}
	return proxyUrl;
}

/**
 * Convert a buffer into a hex string (for hashes).
 * From: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 * @param {*} buffer - Binary buffer
 * @returns {*} - Hex string of the binary buffer
 */
function hex(buffer) {
	var hexCodes = [];
	var view = new DataView(buffer);
	for (var i = 0; i < view.byteLength; i += 4) {
		var value = view.getUint32(i);
		var stringValue = value.toString(16);
		var padding = "00000000";
		var paddedValue = (padding + stringValue).slice(-padding.length);
		hexCodes.push(paddedValue);
	}
	return hexCodes.join("");
}
