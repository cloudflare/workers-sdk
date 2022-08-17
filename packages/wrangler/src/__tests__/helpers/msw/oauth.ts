import { rest } from "msw";

export const handlers = [
	rest.get("/*", (_, res, cxt) => {
		return res(
			cxt.status(200),
			cxt.json({
				success: true,
				errors: [],
				messages: [],
				result: {},
			})
		);
	}),

	// revoke access token
	rest.post(
		"https://dash.cloudflare.com/oauth2/revoke",
		(_, response, context) => {
			response(context.status(200), context.text(""));
		}
	),

	// exchange (auth code | refresh token) for access token
	rest.post(
		"https://dash.cloudflare.com/oauth2/token",
		(_, response, context) => {
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
