import { http, HttpResponse } from "msw";

export const mswSuccessOauthHandlers = [
	http.all(
		"*/oauth/callback",
		() => {
			return HttpResponse.json(
				{
					success: true,
					errors: [],
					messages: [],
					code: "test-oauth-code",
				},
				{ status: 200 }
			);
		},
		{ once: true }
	),
	// revoke access token
	http.post("*/oauth2/revoke", () => HttpResponse.text("", { status: 200 }), {
		once: true,
	}),
	// exchange (auth code | refresh token) for access token
	http.post(
		"*/oauth2/token",
		() => {
			return HttpResponse.json(
				{
					access_token: "test-access-token",
					expires_in: 100000,
					refresh_token: "test-refresh-token",
					scope: "account:read",
				},
				{ status: 200 }
			);
		},
		{ once: true }
	),
];
