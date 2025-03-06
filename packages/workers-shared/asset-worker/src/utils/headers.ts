import { CACHE_CONTROL_BROWSER } from "../constants";

/**
 * Returns a Headers object that contains additional headers (to those
 * present in the original request) that the Assets Server Worker
 * should attach to its response.
 *
 */
export function getAssetHeaders(
	eTag: string,
	contentType: string | undefined,
	request: Request
) {
	const headers = new Headers({
		ETag: `"${eTag}"`,
	});

	if (contentType !== undefined) {
		headers.append("Content-Type", contentType);
	}

	if (isCacheable(request)) {
		headers.append("Cache-Control", CACHE_CONTROL_BROWSER);
	}

	return headers;
}

function isCacheable(request: Request) {
	return !request.headers.has("Authorization") && !request.headers.has("Range");
}
