import fetch from "node-fetch";
import type { RequestInit, Response } from "node-fetch";
import { getAPIToken } from "./user";
import { loginOrRefreshIfRequired } from "./user";
export default async function fetchWithAuthAndLoginIfRequired(
  resource: string,
  init: RequestInit = {}
): Promise<Response> {
  if (typeof resource !== "string") {
    console.warn(
      "fetchWithAuthAndLoginIfRequired will not add an authorisation header to Request objects"
    );
    return fetch(resource, init);
  }
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
  return fetch(resource, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${apiToken}`,
    },
  });
}
