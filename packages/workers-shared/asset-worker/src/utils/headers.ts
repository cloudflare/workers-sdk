import { CACHE_CONTROL_BROWSER } from "../constants";
import { HEADERS_VERSION } from "../handler";
import { generateRulesMatcher, replacer } from "./rules-engine";
import type { AssetConfig } from "../../../utils/types";

/**
 * Returns a Headers object that contains additional headers (to those
 * present in the original request) that the Assets Server Worker
 * should attach to its response.
 *
 */
export function getAssetHeaders(
	eTag: string,
	contentType: string | undefined,
	cacheStatus: string,
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

	// Attach CF-Cache-Status, this will show to users that we are caching assets
	// and it will also populate the cache fields through the logging pipeline.
	headers.append("CF-Cache-Status", cacheStatus);

	return headers;
}

function isCacheable(request: Request) {
	return !request.headers.has("Authorization") && !request.headers.has("Range");
}

export function attachCustomHeaders(
	request: Request,
	response: Response,
	configuration: Required<AssetConfig>
) {
	// Iterate through rules and find rules that match the path
	const headersMatcher = generateRulesMatcher(
		configuration.headers?.version === HEADERS_VERSION
			? configuration.headers.rules
			: {},
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
			response.headers.delete(key);
		});
		Object.keys(set).forEach((key) => {
			if (setMap.has(key.toLowerCase())) {
				response.headers.append(key, set[key]);
			} else {
				response.headers.set(key, set[key]);
				setMap.add(key.toLowerCase());
			}
		});
	});

	return response;
}
