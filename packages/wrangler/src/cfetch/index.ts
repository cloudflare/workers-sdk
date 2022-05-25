import { URLSearchParams } from "node:url";
import { ParseError } from "../parse";
import { fetchInternal } from "./internal";
import type { RequestInit } from "undici";

// Check out https://api.cloudflare.com/ for API docs.

export { getCloudflareAPIBaseURL as getCloudflareApiBaseUrl } from "./internal";

export interface FetchError {
  code: number;
  message: string;
}
export interface FetchResult<ResponseType = unknown> {
  success: boolean;
  result: ResponseType;
  errors: FetchError[];
  messages: string[];
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

function throwFetchError(
  resource: string,
  response: FetchResult<unknown>
): never {
  const error = new ParseError({
    text: "Received a bad response from the API",
    notes: response.errors.map((err) => ({
      text: err.code ? `${err.message} [code: ${err.code}]` : err.message,
    })),
  });
  // add the first error code directly to this error
  // so consumers can use it for specific behaviour
  const code = response.errors[0]?.code;
  if (code) {
    //@ts-expect-error non-standard property on Error
    error.code = code;
  }
  throw error;
}

function hasCursor(result_info: unknown): result_info is { cursor: string } {
  const cursor = (result_info as { cursor: string } | undefined)?.cursor;
  return cursor !== undefined && cursor !== null && cursor !== "";
}
