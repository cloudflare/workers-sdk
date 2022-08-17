import { rest } from "msw";
import type { RestRequest } from "msw";

export const handlers = [
	// revoke access token
	rest.post(
		"https://dash.cloudflare.com/oauth2/revoke",
		(_, response, context) => {
			response(context.status(200));
		}
	),

	// exchange (auth code | refresh token) for access token
	rest.post(
		"https://dash.cloudflare.com/oauth2/token",
		(request, response, context) => {
			return response(
				context.status(200),
				context.json({
					access_token: "test-access-token",
					expires_in: 100000,
					refresh_token: "test-refresh-token",
					scope: "account:read",
				})
			);
		}
	),
];

async function parseOauthTokenBody(
	request: RestRequest
): Promise<TokenRequest> {
	const body = await request.text();
	const output: Record<string, string> = {};

	for (const [key, value] of body.split("&").map((kv) => kv.split("="))) {
		output[key] = value;
	}

	return output as TokenRequest;
}

/** Represents a request to exchange an authorization code for an access token */
type AccessTokenRequest = {
	grant_type: "authorization_code";
	code: string;
	client_id: string;
	code_verifier: string;
};

/** Represents a request to exchange a refresh token for an access token */
type RefreshTokenRequest = {
	grant_type: "refresh_token";
	refresh_token: string;
	client_id: string;
};

type TokenRequest = AccessTokenRequest | RefreshTokenRequest;
