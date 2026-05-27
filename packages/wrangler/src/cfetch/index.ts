import { URLSearchParams } from "node:url";
import {
	throwFetchError,
	hasCursor,
	hasMorePages,
	fetchResultBase,
	fetchListResultBase,
} from "@cloudflare/workers-utils";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";
import { fetchInternal, resolveCredentials } from "./internal";
import type {
	ComplianceConfig,
	FetchResult,
	ApiCredentials,
} from "@cloudflare/workers-utils";
import type { RequestInit } from "undici";

// Check out https://api.cloudflare.com/ for API docs.

export { fetchKVGetValue, performApiFetch } from "./internal";

/**
 * Make a fetch request, and extract the `result` from the JSON response.
 */
export async function fetchResult<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal,
	apiToken?: ApiCredentials
): Promise<ResponseType> {
	apiToken = await resolveCredentials(complianceConfig, apiToken);
	return fetchResultBase(
		complianceConfig,
		resource,
		init,
		`wrangler/${wranglerVersion}`,
		logger,
		queryParams,
		abortSignal,
		apiToken
	);
}

/**
 * Make a fetch request to the GraphQL API, and return the JSON response.
 */
export async function fetchGraphqlResult<ResponseType>(
	complianceConfig: ComplianceConfig,
	init: RequestInit = {},
	abortSignal?: AbortSignal
): Promise<ResponseType> {
	const { response: json } = await fetchInternal<ResponseType>(
		complianceConfig,
		"/graphql",
		{ ...init, method: "POST" }, //Cloudflare API v4 doesn't allow GETs to /graphql
		undefined,
		abortSignal
	);
	if (json) {
		return json;
	} else {
		throw new Error("A request to the Cloudflare API (/graphql) failed.");
	}
}

/**
 * Make a fetch request for a list of values,
 * extracting the `result` from the JSON response,
 * and repeating the request if the results are paginated.
 */
export async function fetchListResult<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	queryParams?: URLSearchParams
): Promise<ResponseType[]> {
	const credentials = await resolveCredentials(complianceConfig);
	return fetchListResultBase(
		complianceConfig,
		resource,
		init,
		`wrangler/${wranglerVersion}`,
		logger,
		queryParams,
		credentials
	);
}

/**
 * Make a fetch request for a list of values,
 * extracting the `result` from the JSON response,
 * and repeating the request if the results are paginated.
 *
 * This is similar to fetchListResult, but it uses the `page` query parameter instead of `cursor`.
 */
export async function fetchPagedListResult<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	queryParams?: URLSearchParams
): Promise<ResponseType[]> {
	const results: ResponseType[] = [];
	let getMoreResults = true;
	let page = 1;
	while (getMoreResults) {
		queryParams = new URLSearchParams(queryParams);
		queryParams.set("page", String(page));

		const { response: json, status } = await fetchInternal<
			FetchResult<ResponseType[]>
		>(complianceConfig, resource, init, queryParams);
		if (json.success) {
			results.push(...json.result);
			if (hasMorePages(json.result_info)) {
				page = page + 1;
			} else {
				getMoreResults = false;
			}
		} else {
			throwFetchError(resource, json, status);
		}
	}
	return results;
}

/**
 * Make a fetch request for a specific "page" of values using a cursor.
 * This will make multiple requests sequentially to find the cursor for the desired page.
 */
export async function fetchCursorPage<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	queryParams?: URLSearchParams
): Promise<ResponseType> {
	let cursor: string | undefined;
	let results: ResponseType = [] as ResponseType;

	const page = parseInt(queryParams?.get("page") ?? "1", 10);
	// Remove 'page' to then use cursor
	queryParams?.delete("page");

	for (let currentPage = 1; currentPage <= page; currentPage++) {
		const pageQueryParams = new URLSearchParams(queryParams);
		if (cursor) {
			pageQueryParams.set("cursor", cursor);
		}

		const { response: json, status } = await fetchInternal<
			FetchResult<ResponseType>
		>(complianceConfig, resource, init, pageQueryParams);

		if (json.success) {
			if (currentPage === page) {
				results = json.result;
			}

			if (hasCursor(json.result_info)) {
				cursor = json.result_info.cursor;
			} else {
				// Requested page is out of bounds
				if (currentPage < page) {
					return [] as ResponseType;
				}
				break;
			}
		} else {
			throwFetchError(resource, json, status);
		}
	}

	return results;
}
