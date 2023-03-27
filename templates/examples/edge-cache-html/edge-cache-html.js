// IMPORTANT: Either A Key/Value Namespace must be bound to this worker script
// using the variable name EDGE_CACHE. or the API parameters below should be
// configured. KV is recommended if possible since it can purge just the HTML
// instead of the full cache.

// API settings if KV isn't being used
const CLOUDFLARE_API = {
	email: "", // From https://dash.cloudflare.com/profile
	key: "", // Global API Key from https://dash.cloudflare.com/profile
	zone: "", // "Zone ID" from the API section of the dashboard overview page https://dash.cloudflare.com/
};

// Default cookie prefixes for bypass
const DEFAULT_BYPASS_COOKIES = ["wp-", "wordpress", "comment_", "woocommerce_"];

/**
 * Main worker entry point.
 */
export default {
	async fetch(request, env, ctx) {
		let upstreamCache = request.headers.get("x-HTML-Edge-Cache");

		// Only process requests if KV store is set up and there is no
		// HTML edge cache in front of this worker (only the outermost cache
		// should handle HTML caching in case there are varying levels of support).
		let configured = false;
		if (typeof env.EDGE_CACHE !== "undefined") {
			configured = true;
		} else if (
			CLOUDFLARE_API.email.length &&
			CLOUDFLARE_API.key.length &&
			CLOUDFLARE_API.zone.length
		) {
			configured = true;
		}

		// Bypass processing of image requests (for everything except Firefox which doesn't use image/*)
		const accept = request.headers.get("Accept");
		let isImage = false;
		if (accept && accept.indexOf("image/*") !== -1) {
			isImage = true;
		}

		if (configured && !isImage && upstreamCache === null) {
			ctx.passThroughOnException();
			ctx.respondWith(processRequest(request));
		}
	},
};

/**
 * Process every request coming through to add the edge-cache header,
 * watch for purge responses and possibly cache HTML GET requests.
 *
 * @param {Request} originalRequest - Original request
 * @param {ExecutionContext} ctx - Original context (for additional async waiting)
 */
async function processRequest(originalRequest, ctx) {
	let cfCacheStatus = null;
	const accept = originalRequest.headers.get("Accept");
	const isHTML = accept && accept.indexOf("text/html") >= 0;
	let { response, cacheVer, status, bypassCache } = await getCachedResponse(
		originalRequest
	);

	if (response === null) {
		// Clone the request, add the edge-cache header and send it through.
		let request = new Request(originalRequest);
		request.headers.set(
			"x-HTML-Edge-Cache",
			"supports=cache|purgeall|bypass-cookies"
		);
		response = await fetch(request);

		if (response) {
			const options = getResponseOptions(response);
			if (options && options.purge) {
				await purgeCache(cacheVer);
				status += ", Purged";
			}
			bypassCache = bypassCache || shouldBypassEdgeCache(request, response);
			if (
				(!options || options.cache) &&
				isHTML &&
				originalRequest.method === "GET" &&
				response.status === 200 &&
				!bypassCache
			) {
				status += await cacheResponse(cacheVer, originalRequest, response);
			}
		}
	} else {
		// If the origin didn't send the control header we will send the cached response but update
		// the cached copy asynchronously (stale-while-revalidate). This commonly happens with
		// a server-side disk cache that serves the HTML directly from disk.
		cfCacheStatus = "HIT";
		if (originalRequest.method === "GET" && response.status === 200 && isHTML) {
			bypassCache =
				bypassCache || shouldBypassEdgeCache(originalRequest, response);
			if (!bypassCache) {
				const options = getResponseOptions(response);
				if (!options) {
					status += ", Refreshed";
					ctx.waitUntil(updateCache(originalRequest, cacheVer));
				}
			}
		}
	}

	if (
		response &&
		status !== null &&
		originalRequest.method === "GET" &&
		response.status === 200 &&
		isHTML
	) {
		response = new Response(response.body, response);
		response.headers.set("x-HTML-Edge-Cache-Status", status);
		if (cacheVer !== null) {
			response.headers.set("x-HTML-Edge-Cache-Version", cacheVer.toString());
		}
		if (cfCacheStatus) {
			response.headers.set("CF-Cache-Status", cfCacheStatus);
		}
	}

	return response;
}

/**
 * Determine if the cache should be bypassed for the given request/response pair.
 * Specifically, if the request includes a cookie that the response flags for bypass.
 * Can be used on cache lookups to determine if the request needs to go to the origin and
 * origin responses to determine if they should be written to cache.
 * @param {Request} request - Request
 * @param {Response} response - Response
 * @returns {bool} true if the cache should be bypassed
 */
function shouldBypassEdgeCache(request, response) {
	let bypassCache = false;

	if (request && response) {
		const options = getResponseOptions(response);
		const cookieHeader = request.headers.get("cookie");
		let bypassCookies = DEFAULT_BYPASS_COOKIES;
		if (options) {
			bypassCookies = options.bypassCookies;
		}
		if (cookieHeader && cookieHeader.length && bypassCookies.length) {
			const cookies = cookieHeader.split(";");
			for (let cookie of cookies) {
				// See if the cookie starts with any of the logged-in user prefixes
				for (let prefix of bypassCookies) {
					if (cookie.trim().startsWith(prefix)) {
						bypassCache = true;
						break;
					}
				}
				if (bypassCache) {
					break;
				}
			}
		}
	}

	return bypassCache;
}

const CACHE_HEADERS = ["Cache-Control", "Expires", "Pragma"];

/**
 * Check for cached HTML GET requests.
 *
 * @param {Request} request - Original request
 */
async function getCachedResponse(request) {
	let response = null;
	let cacheVer = null;
	let bypassCache = false;
	let status = "Miss";

	// Only check for HTML GET requests (saves on reading from KV unnecessarily)
	// and not when there are cache-control headers on the request (refresh)
	const accept = request.headers.get("Accept");
	const cacheControl = request.headers.get("Cache-Control");
	let noCache = false;
	if (cacheControl && cacheControl.indexOf("no-cache") !== -1) {
		noCache = true;
		status = "Bypass for Reload";
	}
	if (
		!noCache &&
		request.method === "GET" &&
		accept &&
		accept.indexOf("text/html") >= 0
	) {
		// Build the versioned URL for checking the cache
		cacheVer = await GetCurrentCacheVersion(cacheVer);
		const cacheKeyRequest = GenerateCacheRequest(request, cacheVer);

		// See if there is a request match in the cache
		try {
			let cache = caches.default;
			let cachedResponse = await cache.match(cacheKeyRequest);
			if (cachedResponse) {
				// Copy Response object so that we can edit headers.
				cachedResponse = new Response(cachedResponse.body, cachedResponse);

				// Check to see if the response needs to be bypassed because of a cookie
				bypassCache = shouldBypassEdgeCache(request, cachedResponse);

				// Copy the original cache headers back and clean up any control headers
				if (bypassCache) {
					status = "Bypass Cookie";
				} else {
					status = "Hit";
					cachedResponse.headers.delete("Cache-Control");
					cachedResponse.headers.delete("x-HTML-Edge-Cache-Status");
					for (header of CACHE_HEADERS) {
						let value = cachedResponse.headers.get(
							"x-HTML-Edge-Cache-Header-" + header
						);
						if (value) {
							cachedResponse.headers.delete(
								"x-HTML-Edge-Cache-Header-" + header
							);
							cachedResponse.headers.set(header, value);
						}
					}
					response = cachedResponse;
				}
			} else {
				status = "Miss";
			}
		} catch (err) {
			// Send the exception back in the response header for debugging
			status = "Cache Read Exception: " + err.message;
		}
	}

	return { response, cacheVer, status, bypassCache };
}

/**
 * Asynchronously purge the HTML cache.
 * @param {Int} cacheVer - Current cache version (if retrieved)
 * @param {Context} ctx - Original context
 */
async function purgeCache(cacheVer, ctx) {
	if (typeof EDGE_CACHE !== "undefined") {
		// Purge the KV cache by bumping the version number
		cacheVer = await GetCurrentCacheVersion(cacheVer);
		cacheVer++;
		ctx.waitUntil(env.EDGE_CACHE.put("html_cache_version", cacheVer.toString()));
	} else {
		// Purge everything using the API
		const url =
			"https://api.cloudflare.com/client/v4/zones/" +
			CLOUDFLARE_API.zone +
			"/purge_cache";
		ctx.waitUntil(
			fetch(url, {
				method: "POST",
				headers: {
					"X-Auth-Email": CLOUDFLARE_API.email,
					"X-Auth-Key": CLOUDFLARE_API.key,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ purge_everything: true }),
			})
		);
	}
}

/**
 * Update the cached copy of the given page
 * @param {Request} originalRequest - Original Request
 * @param {String} cacheVer - Cache Version
 * @param {Context} ctx - Original ctx
 */
async function updateCache(originalRequest, cacheVer, ctx) {
	// Clone the request, add the edge-cache header and send it through.
	let request = new Request(originalRequest);
	request.headers.set(
		"x-HTML-Edge-Cache",
		"supports=cache|purgeall|bypass-cookies"
	);
	response = await fetch(request);

	if (response) {
		status = ": Fetched";
		const options = getResponseOptions(response);
		if (options && options.purge) {
			await purgeCache(cacheVer);
		}
		let bypassCache = shouldBypassEdgeCache(request, response);
		if ((!options || options.cache) && !bypassCache) {
			await cacheResponse(cacheVer, originalRequest, response);
		}
	}
}

/**
 * Cache the returned content (but only if it was a successful GET request)
 *
 * @param {Int} cacheVer - Current cache version (if already retrieved)
 * @param {Request} request - Original Request
 * @param {Response} originalResponse - Response to (maybe) cache
 * @param {Context} ctx - Original ctx
 * @returns {bool} true if the response was cached
 */
async function cacheResponse(cacheVer, request, originalResponse, ctx) {
	let status = "";
	const accept = request.headers.get("Accept");
	if (
		request.method === "GET" &&
		originalResponse.status === 200 &&
		accept &&
		accept.indexOf("text/html") >= 0
	) {
		cacheVer = await GetCurrentCacheVersion(cacheVer);
		const cacheKeyRequest = GenerateCacheRequest(request, cacheVer);

		try {
			// Move the cache headers out of the way so the response can actually be cached.
			// First clone the response so there is a parallel body stream and then
			// create a new response object based on the clone that we can edit.
			let cache = caches.default;
			let clonedResponse = originalResponse.clone();
			let response = new Response(clonedResponse.body, clonedResponse);
			for (header of CACHE_HEADERS) {
				let value = response.headers.get(header);
				if (value) {
					response.headers.delete(header);
					response.headers.set("x-HTML-Edge-Cache-Header-" + header, value);
				}
			}
			response.headers.delete("Set-Cookie");
			response.headers.set("Cache-Control", "public; max-age=315360000");
			ctx.waitUntil(cache.put(cacheKeyRequest, response));
			status = ", Cached";
		} catch (err) {
			// status = ", Cache Write Exception: " + err.message;
		}
	}
	return status;
}

/******************************************************************************
 * Utility Functions
 *****************************************************************************/

/**
 * Parse the commands from the x-HTML-Edge-Cache response header.
 * @param {Response} response - HTTP response from the origin.
 * @returns {*} Parsed commands
 */
function getResponseOptions(response) {
	let options = null;
	let header = response.headers.get("x-HTML-Edge-Cache");
	if (header) {
		options = {
			purge: false,
			cache: false,
			bypassCookies: [],
		};
		let commands = header.split(",");
		for (let command of commands) {
			if (command.trim() === "purgeall") {
				options.purge = true;
			} else if (command.trim() === "cache") {
				options.cache = true;
			} else if (command.trim().startsWith("bypass-cookies")) {
				let separator = command.indexOf("=");
				if (separator >= 0) {
					let cookies = command.substr(separator + 1).split("|");
					for (let cookie of cookies) {
						cookie = cookie.trim();
						if (cookie.length) {
							options.bypassCookies.push(cookie);
						}
					}
				}
			}
		}
	}

	return options;
}

/**
 * Retrieve the current cache version from KV
 * @param {Int} cacheVer - Current cache version value if set.
 * @returns {Int} The current cache version.
 */
async function GetCurrentCacheVersion(cacheVer) {
	if (cacheVer === null) {
		if (typeof EDGE_CACHE !== "undefined") {
			cacheVer = await EDGE_CACHE.get("html_cache_version");
			if (cacheVer === null) {
				// Uninitialized - first time through, initialize KV with a value
				// Blocking but should only happen immediately after worker activation.
				cacheVer = 0;
				await EDGE_CACHE.put("html_cache_version", cacheVer.toString());
			} else {
				cacheVer = parseInt(cacheVer);
			}
		} else {
			cacheVer = -1;
		}
	}
	return cacheVer;
}

/**
 * Generate the versioned Request object to use for cache operations.
 * @param {Request} request - Base request
 * @param {Int} cacheVer - Current Cache version (must be set)
 * @returns {Request} Versioned request object
 */
function GenerateCacheRequest(request, cacheVer) {
	let cacheUrl = request.url;
	if (cacheUrl.indexOf("?") >= 0) {
		cacheUrl += "&";
	} else {
		cacheUrl += "?";
	}
	cacheUrl += "cf_edge_cache_ver=" + cacheVer;
	return new Request(cacheUrl);
}
