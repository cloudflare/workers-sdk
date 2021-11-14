import fetch from "node-fetch";
import type { RequestInit } from "node-fetch";
import { getAPIToken } from "./user";
import { loginOrRefreshIfRequired } from "./user";

export const CF_API_BASE_URL =
  process.env.CF_API_BASE_URL || "https://api.cloudflare.com/client/v4";

export default async function fetchWithAuthAndLoginIfRequired<ResponseType>(
  resource: string,
  init: RequestInit = {}
): Promise<ResponseType> {
  const loggedIn = await loginOrRefreshIfRequired();
  if (!loggedIn) {
    throw new Error("Not logged in");
  }
  const apiToken = getAPIToken();
  if (!apiToken) {
    throw new Error("No API token found");
  }
  // @ts-expect-error Authorization isn't non HeadersInit, annoyingly
  if (init.headers?.Authorization) {
    throw new Error(
      "fetchWithAuthAndLoginIfRequired will not add an authorisation header a request that already specifies it"
    );
  }
  // should I bother with response code?
  // maybe I can just throw the json error?

  const response = await fetch(`${CF_API_BASE_URL}${resource}`, {
    method: "GET",
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${apiToken}`,
    },
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (parseError) {
    // hate this edge case
    // the only api call I know that doesn't return json is kv:key get <key>

    // maybe it's a plain response
    if (response.ok) {
      // @ts-expect-error bleh
      return text;
    } else {
      // UGH.
      throw new Error(`${response.status}: ${response.statusText}`);
    }
  }

  if (json.success) {
    return json.result;
  } else {
    const errorDesc = json.errors?.[0];
    if (errorDesc) {
      // TODO: map .message to real human readable strings
      const error = new Error(`${errorDesc.code}: ${errorDesc.message}`);
      // @ts-expect-error hacksss
      error.code = errorDesc.code;
      throw error;
    } else {
      // This should almost never happen.
      // ... which means it'll probably happen, lol.
      throw new Error(`${response.status}: ${response.statusText}`);
    }
  }
}
