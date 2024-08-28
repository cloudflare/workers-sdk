import { CACHE_CONTROL_BROWSER } from "../constants";
import type { AssetMetadata } from "./kv";

/**
 * Returns a Headers object that is the union of `existingHeaders`
 * and `additionalHeaders`. Headers specified by `additionalHeaders`
 * will override those specified by `existingHeaders`.
 *
 */
export function getMergedHeaders(
	existingHeaders: Headers,
	additionalHeaders: Headers
) {
	const mergedHeaders = new Headers(existingHeaders);
	for (const [key, value] of additionalHeaders) {
		// override existing headers
		mergedHeaders.set(key, value);
	}

	return mergedHeaders;
}

/**
 * Returns a Headers object that contains additional headers (to those
 * present in the original request) that the Assets Server Worker
 * should attach to its response.
 *
 */
export function getAdditionalHeaders(
	assetKey: string,
	assetMetadata: AssetMetadata | null,
	request: Request
) {
	let contentType = assetMetadata?.contentType ?? "application/octet-stream";
	if (contentType.startsWith("text/") && !contentType.includes("charset")) {
		contentType = `${contentType}; charset=utf-8`;
	}

	const headers = new Headers({
		"Access-Control-Allow-Origin": "*",
		"Content-Type": contentType,
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"X-Content-Type-Options": "nosniff",
		ETag: `${assetKey}`,
	});

	if (isCacheable(request)) {
		headers.append("Cache-Control", CACHE_CONTROL_BROWSER);
	}

	return headers;
}

function isCacheable(request: Request) {
	return !request.headers.has("authorization") && !request.headers.has("range");
}
