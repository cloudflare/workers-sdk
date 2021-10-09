import type { CfAccount } from "../api/worker";
import type { FetchJson } from "./fetch";
import { fetchJson } from "./fetch";
import type { RequestInit } from "node-fetch";

interface CfError {
  code: number;
  message: string;
  error_chain?: CfError[];
}

interface CfResponse<T> {
  success: boolean;
  errors: CfError[];
  result: T;
}

/**
 * Creates a custom `fetch()` function for the Cloudflare API.
 */
export function fetchCf(account: CfAccount): FetchJson {
  const { apiToken } = account;
  const fetch = fetchJson({
    userAgent: "workers-cli/1.0",
    host: "api.cloudflare.com",
    headers: {
      Authorization: "Bearer " + apiToken,
    },
  });

  return async <T>(input: string, init?: RequestInit) => {
    const response = await fetch<CfResponse<T>>(input, init);
    const { success, errors, result } = response;

    if (success) {
      return result;
    }
    if (errors) {
      throw toError(errors[0]);
    }
    throw new Error("Invalid Cloudflare response: " + JSON.stringify(response));
  };
}

/**
 * Converts a Cloudflare error into a JavaScript `Error`.
 */
function toError(err: CfError): Error {
  const { message, code, error_chain } = err;

  let reason = `${message} [code: ${code}]`;
  if (error_chain) {
    const { message, code } = error_chain[0];
    reason += `\n\tcaused by, ${message} [code: ${code}]`;
  }

  const error = new Error(reason);
  error.name = "CloudflareError";
  return error;
}
