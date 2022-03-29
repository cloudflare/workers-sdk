import { ChildProcess } from "child_process";
import fetchMock from "jest-fetch-mock";
import { Request } from "undici";
const { fetch } = jest.requireActual("undici") as {
  fetch: (input: string) => Promise<unknown>;
};

// the response to send when wrangler wants an oauth grant
let oauthGrantResponse: GrantResponseOptions | "timeout" = {};

/**
 * A mock implementation for `openInBrowser` that sends an oauth grant response
 * to wrangler. Use it like this:
 *
 * ```js
 * jest.mock("../open-in-browser");
 * (openInBrowser as jest.Mock).mockImplementation(mockOpenInBrowser);
 * ```
 */
export const mockOpenInBrowser = async (url: string, ..._args: unknown[]) => {
  const { searchParams } = new URL(url);
  if (oauthGrantResponse === "timeout") {
    throw "unimplemented";
  } else {
    const queryParams = toQueryParams(oauthGrantResponse, searchParams);
    // don't await this -- it will block the rest of the login flow
    fetch(`${searchParams.get("redirect_uri")}?${queryParams}`).catch((e) => {
      throw new Error(
        "Failed to send OAuth Grant to wrangler, maybe the server was closed?",
        e as Error
      );
    });
    return new ChildProcess();
  }
};

/**
 * Functions to help with mocking various parts of the OAuth Flow
 */
export const mockOAuthFlow = () => {
  afterEach(() => {
    fetchMock.resetMocks();
  });

  const mockGrantAuthorization = ({
    respondWith,
  }: {
    respondWith: "timeout" | "success" | "failure" | GrantResponseOptions;
  }) => {
    if (respondWith === "failure") {
      oauthGrantResponse = {
        error: "access_denied",
      };
    } else if (respondWith === "success") {
      oauthGrantResponse = {
        code: "test-oauth-code",
      };
    } else if (respondWith === "timeout") {
      oauthGrantResponse = "timeout";
    } else {
      oauthGrantResponse = respondWith;
    }
  };

  const mockRevokeAuthorization = () => {
    const outcome = {
      actual: new Request("https://example.org"),
      expected: new Request("https://dash.cloudflare.com/oauth2/revoke", {
        method: "POST",
      }),
    };

    fetchMock.mockIf(outcome.expected.url, async (req) => {
      outcome.actual = req;
      return "";
    });

    return outcome;
  };

  const mockGrantAccessToken = ({
    respondWith,
  }: {
    respondWith: MockTokenResponse;
  }) => {
    const outcome = {
      actual: new Request("https://example.org"),
      expected: new Request("https://dash.cloudflare.com/oauth2/token", {
        method: "POST",
      }),
    };

    fetchMock.mockOnceIf(outcome.expected.url, async (req) => {
      outcome.actual = req;
      return makeTokenResponse(respondWith);
    });

    return outcome;
  };

  return {
    mockGrantAuthorization,
    mockRevokeAuthorization,
    mockGrantAccessToken,
  };
};

type GrantResponseOptions = {
  code?: string;
  error?: ErrorType | ErrorType[];
};

const toQueryParams = (
  { code, error }: GrantResponseOptions,
  wranglerRequestParams: URLSearchParams
): string => {
  const queryParams = [];
  if (code) {
    queryParams.push(`code=${code}`);
  }
  if (error) {
    const stringifiedErr = Array.isArray(error) ? error.join(",") : error;
    queryParams.push(`error=${stringifiedErr}`);
  }

  queryParams.push(`state=${wranglerRequestParams.get("state")}`);

  return queryParams.join("&");
};

type ErrorType =
  | "invalid_request"
  | "invalid_grant"
  | "unauthorized_client"
  | "access_denied"
  | "unsupported_response_type"
  | "invalid_scope"
  | "server_error"
  | "temporarily_unavailable"
  | "invalid_client"
  | "unsupported_grant_type"
  | "invalid_json"
  | "invalid_token"
  | "test-token-grant-error";

type MockTokenResponse =
  | "ok"
  | "error"
  | {
      access_token: string;
      expires_in: number;
      refresh_token: string;
      scope: string;
    }
  | {
      error: ErrorType;
    };

const makeTokenResponse = (partialResponse: MockTokenResponse): string => {
  let fullResponse: MockTokenResponse;

  if (partialResponse === "ok") {
    fullResponse = {
      access_token: "test-access-token",
      expires_in: 100000,
      refresh_token: "test-refresh-token",
      scope: "account:read",
    };
  } else if (partialResponse === "error") {
    fullResponse = {
      error: "test-token-grant-error",
    };
  } else {
    fullResponse = partialResponse;
  }

  return JSON.stringify(fullResponse);
};
