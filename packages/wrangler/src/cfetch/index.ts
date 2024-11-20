import { URLSearchParams } from "node:url";
import { APIError } from "../parse";
import { maybeThrowFriendlyError } from "./errors";
import { fetchInternal } from "./internal";
import type { FetchError } from "./errors";
import type { RequestInit } from "undici";

// Check out https://api.cloudflare.com/ for API docs.

export interface FetchResult<ResponseType = unknown> {
	success: boolean;
	result: ResponseType;
	errors: FetchError[];
	messages?: string[];
	result_info?: unknown;
}

export { fetchKVGetValue } from "./internal";

/**
 * Make a fetch request, and extract the `result` from the JSON response.
 */
export async function fetchResult<ResponseType>(
	resource: string,
	init: RequestInit = {},
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal
): Promise<ResponseType> {
	const json = await fetchInternal<FetchResult<ResponseType>>(
		resource,
		init,
		queryParams,
		abortSignal
	);
	if (json.success) {
		return json.result;
	} else {
		throwFetchError(resource, json);
	}
}

/**
 * Make a fetch request to the GraphQL API, and return the JSON response.
 */
export async function fetchGraphqlResult<ResponseType>(
	init: RequestInit = {},
	abortSignal?: AbortSignal
): Promise<ResponseType> {
	const json = await fetchInternal<ResponseType>(
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
		const json = await fetchInternal<FetchResult<ResponseType[]>>(
			resource,
			init,
			queryParams
		);
		if (json.success) {
			results.push(...json.result);
			if (hasCursor(json.result_info)) {
				cursor = json.result_info?.cursor;
			} else {
				getMoreResults = false;
			}
		} else {
			throwFetchError(resource, json);
		}
	}
	return results;
}

/**
 * Make a fetch request for a list of values using pages,
 * extracting the `result` from the JSON response,
 * and repeating the request if the results are paginated.
 *
 * This is similar to fetchListResult, but it uses the `page` query parameter instead of `cursor`.
 */
export async function fetchPagedListResult<ResponseType>(
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

		const json = await fetchInternal<FetchResult<ResponseType[]>>(
			resource,
			init,
			queryParams
		);
		if (json.success) {
			results.push(...json.result);
			if (hasMorePages(json.result_info)) {
				page = page + 1;
			} else {
				getMoreResults = false;
			}
		} else {
			throwFetchError(resource, json);
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
	response: FetchResult<unknown>
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

function renderError(err: FetchError, level = 0): string {
	const chainedMessages =
		err.error_chain
			?.map(
				(chainedError) =>
					`\n${"  ".repeat(level)}- ${renderError(chainedError, level + 1)}`
			)
			.join("\n") ?? "";
	return (
		(err.code ? `${err.message} [code: ${err.code}]` : err.message) +
		chainedMessages
	);
}
