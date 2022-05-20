import { fetch, Headers } from "undici";
import { getEnvironmentVariableFactory } from "../environment-variables";
import { ParseError, parseJSON } from "../parse";
import { getAPIToken, loginOrRefreshIfRequired } from "../user";
import type { URLSearchParams } from "node:url";
import type { RequestInit, HeadersInit } from "undici";

/**
 * Get the URL to use to access the Cloudflare API.
 */
export const getCloudflareAPIBaseURL = getEnvironmentVariableFactory({
  variableName: "CLOUDFLARE_API_BASE_URL",
  deprecatedName: "CF_API_BASE_URL",
  defaultValue: "https://api.cloudflare.com/client/v4",
});

/**
 * Make a fetch request to the Cloudflare API.
 *
 * This function handles acquiring the API token and logging the caller in, as necessary.
 *
 * Check out https://api.cloudflare.com/ for API docs.
 *
 * This function should not be used directly, instead use the functions in `cfetch/index.ts`.
 */
export async function fetchInternal<ResponseType>(
  resource: string,
  init: RequestInit = {},
  queryParams?: URLSearchParams
): Promise<ResponseType> {
  await requireLoggedIn();
  const apiToken = requireApiToken();
  const headers = cloneHeaders(init.headers);
  addAuthorizationHeader(headers, apiToken);

  const queryString = queryParams ? `?${queryParams.toString()}` : "";
  const method = init.method ?? "GET";
  const response = await fetch(
    `${getCloudflareAPIBaseURL()}${resource}${queryString}`,
    {
      method,
      ...init,
      headers,
    }
  );
  const jsonText = await response.text();
  try {
    return parseJSON(jsonText) as ResponseType;
  } catch (err) {
    throw new ParseError({
      text: "Received a malformed response from the API",
      notes: [
        {
          text: truncate(jsonText, 100),
        },
        {
          text: `${method} ${resource} -> ${response.status} ${response.statusText}`,
        },
      ],
    });
  }
}

function truncate(text: string, maxLength: number): string {
  const { length } = text;
  if (length <= maxLength) {
    return text;
  }
  return `${text.substring(0, maxLength)}... (length = ${length})`;
}

function cloneHeaders(
  headers: HeadersInit | undefined
): Record<string, string> {
  return headers instanceof Headers
    ? Object.fromEntries(headers.entries())
    : Array.isArray(headers)
    ? Object.fromEntries(headers)
    : { ...headers };
}

async function requireLoggedIn(): Promise<void> {
  const loggedIn = await loginOrRefreshIfRequired();
  if (!loggedIn) {
    throw new Error("Not logged in.");
  }
}

function requireApiToken(): string {
  const authToken = getAPIToken();
  if (!authToken) {
    throw new Error("No API token found.");
  }
  return authToken;
}

function addAuthorizationHeader(
  headers: Record<string, string>,
  apiToken: string
): void {
  if ("Authorization" in headers) {
    throw new Error(
      "The request already specifies an authorisation header - cannot add a new one."
    );
  }
  headers["Authorization"] = `Bearer ${apiToken}`;
}

/**
 * The implementation for fetching a kv value from the cloudflare API.
 * We special-case this one call, because it's the only API call that
 * doesn't return json. We inline the implementation and try not to share
 * any code with the other calls. We should push back on any new APIs that
 * try to introduce non-"standard" response structures.
 *
 * Note: any calls to fetchKVGetValue must call encodeURIComponent on key
 * before passing it
 */

export async function fetchKVGetValue(
  accountId: string,
  namespaceId: string,
  key: string
): Promise<string> {
  await requireLoggedIn();
  const apiToken = requireApiToken();
  const headers = { Authorization: `Bearer ${apiToken}` };
  const resource = `${getCloudflareAPIBaseURL()}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
  const response = await fetch(resource, {
    method: "GET",
    headers,
  });
  if (response.ok) {
    return await response.text();
  } else {
    throw new Error(
      `Failed to fetch ${resource} - ${response.status}: ${response.statusText});`
    );
  }
}
