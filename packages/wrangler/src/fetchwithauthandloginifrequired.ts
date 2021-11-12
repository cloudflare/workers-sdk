import fetch from "node-fetch";
import type { RequestInit, Response } from "node-fetch";
import { getAPIToken } from "./user";
import { loginOrRefreshIfRequired } from "./user";

export const CF_BASE_URL = "https://api.cloudflare.com/client/v4";
export default async function fetchWithAuthAndLoginIfRequired(
  resource: string,
  init: RequestInit = {}
): Promise<unknown> {
  await loginOrRefreshIfRequired();
  const apiToken = getAPIToken();
  if (!apiToken) {
    throw new Error("No API token found");
  }
  // @ts-expect-error Authorization isn't non HeadersInit, annoyingly
  if (init.headers?.Authorization) {
    console.warn(
      "fetchWithAuthAndLoginIfRequired will not add an authorisation header a request that already specifies it"
    );
    return fetch(resource, init);
  }
  // should I bother with response code?
  // maybe I can just throw the json error?

  const response = await fetch(`${CF_BASE_URL}${resource}`, {
    method: "GET",
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${apiToken}`,
    },
  });
  const json = await response.json();
  // @ts-expect-error these types aren't good
  if (json.success) {
    // @ts-expect-error these types aren't good
    return json.result;
  } else {
    // @ts-expect-error these types aren't good
    const errorDesc = json.errors?.[0];
    if (errorDesc) {
      // TODO: map .message to real human readable strings
      const error = new Error(`${errorDesc.code}: ${errorDesc.message}`);
      // @ts-expect-error hacksss
      error.code = errorDesc.code;
      throw error;
    } else {
      throw new Error(`${response.status}: ${response.statusText}`);
    }
  }
}
