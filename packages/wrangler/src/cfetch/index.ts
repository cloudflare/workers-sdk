import { URLSearchParams } from "node:url";
import { APIError } from "@cloudflare/workers-utils";
import { maybeThrowFriendlyError } from "./errors";
import { fetchInternal } from "./internal";
import type { ApiCredentials } from "../user";
import type { FetchError } from "./errors";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { ErrorData } from "cloudflare/resources/shared";
import type { RequestInit } from "undici";

// Check out https://api.cloudflare.com/ for API docs.

export interface FetchResult<ResponseType = unknown> {
	success: boolean;
	result: ResponseType;
	errors: FetchError[];
	messages?: string[];
	result_info?: unknown;
}

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
	const { response: json, status } = await fetchInternal<
		FetchResult<ResponseType>
	>(complianceConfig, resource, init, queryParams, abortSignal, apiToken);
	if (json.success) {
		return json.result;
	} else {
		throwFetchError(resource, json, status);
	}
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
	const results: ResponseType[] = [];
	let getMoreResults = true;
	let cursor: string | undefined;
	while (getMoreResults) {
		if (cursor) {
			queryParams = new URLSearchParams(queryParams);
			queryParams.set("cursor", cursor);
		}
		const { response: json, status } = await fetchInternal<
			FetchResult<ResponseType[]>
		>(complianceConfig, resource, init, queryParams);
		if (json.success) {
			results.push(...json.result);
			if (hasCursor(json.result_info)) {
				cursor = json.result_info?.cursor;
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

interface PageResultInfo {
	page: number;
	per_page: number;
	count: number;
	total_count: number;
}

export function hasMorePages(
	result_info: unknown
): result_info is PageResultInfo {
	const page = (result_info as PageResultInfo | undefined)?.page;
	const per_page = (result_info as PageResultInfo | undefined)?.per_page;
	const total = (result_info as PageResultInfo | undefined)?.total_count;

	return (
		page !== undefined &&
		per_page !== undefined &&
		total !== undefined &&
		page * per_page < total
	);
}

function throwFetchError(
	resource: string,
	response: FetchResult<unknown>,
	status: number
): never {
	// This is an error from within an MSW handler
	if (typeof vitest !== "undefined" && !("errors" in response)) {
		throw response;
	}
	for (const error of response.errors) {
		maybeThrowFriendlyError(error);
	}

	const error = new APIError({
		text: `A request to the Cloudflare API (${resource}) failed.`,
		notes: [
			...response.errors.map((err) => ({ text: renderError(err) })),
			...(response.messages?.map((text) => ({ text })) ?? []),
		],
		status,
	});
	// add the first error code directly to this error
	// so consumers can use it for specific behaviour
	const code = response.errors[0]?.code;
	if (code) {
		error.code = code;
	}
	// extract the account tag from the resource (if any)
	error.accountTag = extractAccountTag(resource);
	throw error;
}

export function extractAccountTag(resource: string) {
	const re = new RegExp("/accounts/([a-zA-Z0-9]+)/?");
	const matches = re.exec(resource);
	return matches?.[1];
}

function hasCursor(result_info: unknown): result_info is { cursor: string } {
	const cursor = (result_info as { cursor: string } | undefined)?.cursor;
	return cursor !== undefined && cursor !== null && cursor !== "";
}

export function renderError(err: FetchError | ErrorData, level = 0): string {
	const indent = "  ".repeat(level);
	const chainedMessages =
		"error_chain" in err
			? err.error_chain
					?.map(
						(chainedError) =>
							`\n\n${indent}- ${renderError(chainedError, level + 1)}`
					)
					.join("\n") ?? ""
			: "";
	return (
		(err.code ? `${err.message} [code: ${err.code}]` : err.message) +
		(err.documentation_url
			? `\n${indent}To learn more about this error, visit: ${err.documentation_url}`
			: "") +
		chainedMessages
	);
}
