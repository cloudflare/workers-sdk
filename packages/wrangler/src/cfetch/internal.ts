import { fetch } from "undici";
import type { RequestInit, HeadersInit } from "undici";
import { getAPIToken, loginOrRefreshIfRequired } from "../user";
import type { URLSearchParams } from "node:url";

export const CF_API_BASE_URL =
  process.env.CF_API_BASE_URL || "https://api.cloudflare.com/client/v4";

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
  const response = await fetch(`${CF_API_BASE_URL}${resource}${queryString}`, {
    method: "GET",
    ...init,
    headers,
  });

  const jsonText = await response.text();
  try {
    const json = JSON.parse(jsonText);
    return json as ResponseType;
  } catch (e) {
    throw new Error(
      `Failed to fetch ${resource} - ${response.status}: ${response.statusText}\nInvalid JSON response:\n${jsonText}`
    );
  }
}

function cloneHeaders(headers: HeadersInit | undefined): HeadersInit {
  return { ...headers };
}

async function requireLoggedIn(): Promise<void> {
  const loggedIn = await loginOrRefreshIfRequired();
  if (!loggedIn) {
    throw new Error("Not logged in.");
  }
}

function requireApiToken(): string {
  const apiToken = getAPIToken();
  if (!apiToken) {
    throw new Error("No API token found.");
  }
  return apiToken;
}

function addAuthorizationHeader(headers: HeadersInit, apiToken: string): void {
  if (headers["Authorization"]) {
    throw new Error(
      "The request already specifies an authorisation header - cannot add a new one."
    );
  }
  headers["Authorization"] = `Bearer ${apiToken}`;
}
