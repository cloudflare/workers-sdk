import type { Mock } from "vitest";

import { http, HttpResponse } from "msw";
import { Request } from "undici";

import openInBrowser from "../../open-in-browser";
import { mockHttpServer } from "./mock-http-server";
import { createFetchResult, msw } from "./msw";

export function mockGetMemberships(
	accounts: { id: string; account: { id: string; name: string } }[]
) {
	msw.use(
		http.get(
			"*/memberships",
			() => {
				return HttpResponse.json(createFetchResult(accounts));
			},
			{ once: true }
		)
	);
}
export function mockGetMembershipsFail() {
	msw.use(
		http.get(
			"*/memberships",
			() => {
				return HttpResponse.json(createFetchResult([], false));
			},
			{ once: true }
		)
	);
}

/**
 * Functions to help with mocking various parts of the OAuth Flow
 *
 * Most tests should not need to do this.
 * Only use it if you want to check the OAuth flow as part of the test.
 */
export const mockOAuthFlow = () => {
	// the response to send when wrangler wants an oauth grant
	let oauthGrantResponse: GrantResponseOptions | "timeout" = {};
	const fetchHttp = mockHttpServer();

	/**
	 * Mock out the callback from a browser to our HttpServer.
	 *
	 * This function will override `openInBrowser()` so that instead of opening a browser window
	 * at the OAuth URL, it will automatically trigger the callback URL on the mock HttpServer that
	 * we have created as part of the call to `mockOAuthFlow()`.
	 */
	const mockOAuthServerCallback = (
		respondWith?: "timeout" | "success" | "failure" | GrantResponseOptions
	) => {
		(openInBrowser as Mock).mockImplementation(async (url: string) => {
			if (respondWith) {
				mockGrantAuthorization({ respondWith });
			}
			// We don't support the grant response timing out.
			if (oauthGrantResponse === "timeout") {
				throw "unimplemented";
			}

			// Create a fake callback request that would be created by the OAuth server
			const { searchParams } = new URL(url);
			const queryParams = toQueryParams(oauthGrantResponse, searchParams);
			const request = new Request(
				`${searchParams.get("redirect_uri")}?${queryParams}`
			);

			// Trigger the mock HttpServer to handle this fake request to continue the OAuth flow.
			fetchHttp(request).catch((e) => {
				throw new Error(
					"Failed to send OAuth Grant to wrangler, maybe the server was closed?",
					e as Error
				);
			});
		});
	};

	// Handled in `mockOAuthServerCallback`
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

	const mockGrantAccessToken = ({
		respondWith,
		domain = "dash.cloudflare.com",
	}: {
		respondWith: MockTokenResponse;
		domain?: string;
	}) => {
		const outcome = {
			actual: "https://example.org",
			expected: `https://${domain}/oauth2/token`,
		};
		msw.use(
			http.post(
				outcome.expected,
				async ({ request }) => {
					const url = new URL(request.url);

					outcome.actual = url.toString();
					return HttpResponse.json(makeTokenResponse(respondWith));
				},
				{ once: true }
			)
		);

		return outcome;
	};

	function mockDomainUsesAccess({
		usesAccess,
		domain = "dash.cloudflare.com",
	}: {
		usesAccess: boolean;
		domain?: string;
	}) {
		// If the domain relies upon Cloudflare Access, then a request to the domain
		// will result in a redirect to the `cloudflareaccess.com` domain.
		msw.use(
			http.get(
				`https://${domain}/`,
				() => {
					let status = 200;
					let headers: Record<string, string> = {
						"Content-Type": "application/json",
					};
					if (usesAccess) {
						status = 302;
						headers = { location: "cloudflareaccess.com" };
					}
					return HttpResponse.json(null, { status: status, headers });
				},
				{ once: true }
			)
		);
	}

	return {
		mockHttpServer,
		mockDomainUsesAccess,
		mockGrantAccessToken,
		mockOAuthServerCallback,
		mockExchangeRefreshTokenForAccessToken,
	};
};

export function mockExchangeRefreshTokenForAccessToken({
	respondWith,
	domain = "dash.cloudflare.com",
}: {
	respondWith: "refreshSuccess" | "refreshError" | "badResponse";
	domain?: string;
}) {
	msw.use(
		http.post(
			`https://${domain}/oauth2/token`,
			async () => {
				switch (respondWith) {
					case "refreshSuccess":
						return HttpResponse.json(
							{
								access_token: "access_token_success_mock",
								expires_in: 1701,
								refresh_token: "refresh_token_success_mock",
								scope: "scope_success_mock",
								token_type: "bearer",
							},
							{ status: 200 }
						);
					case "refreshError":
						return HttpResponse.json(
							{
								error: "invalid_request",
								error_description: "error_description_mock",
								error_hint: "error_hint_mock",
								error_verbose: "error_verbose_mock",
								status_code: 400,
							},
							{ status: 400 }
						);
					case "badResponse":
						return HttpResponse.text(
							`<html> <body> This shouldn't be sent, but should be handled </body> </html>`,
							{ status: 400 }
						);

					default:
						throw new Error(
							"Not a respondWith option for `mockExchangeRefreshTokenForAccessToken`"
						);
				}
			},
			{ once: true }
		)
	);
}

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

const makeTokenResponse = (partialResponse: MockTokenResponse) => {
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

	return fullResponse;
};
