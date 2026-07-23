import { generateAuthUrl, getAuthUrlFromEnv } from "@cloudflare/workers-auth";
import {
	DefaultScopeKeys,
	getClientIdFromEnv,
	OAUTH_CALLBACK_URL,
} from "@cloudflare/workers-auth/wrangler";
import { fetch } from "undici";
import { describe, it } from "vitest";

describe("auth scopes", () => {
	it("default OAuth scopes are accepted by the Cloudflare backend", async ({
		expect,
	}) => {
		const url = generateAuthUrl({
			authUrl: getAuthUrlFromEnv(),
			clientId: getClientIdFromEnv(),
			scopes: DefaultScopeKeys,
			stateQueryParam: "test-state",
			codeChallenge: "test-code-challenge",
			redirectUri: OAUTH_CALLBACK_URL,
		});

		const response = await fetch(url, { redirect: "manual" });

		expect(response.status).toBe(302);

		const location = response.headers.get("location");
		expect(location).toEqual(expect.any(String));
		expect(location).not.toContain("error=invalid_scope");
	});
});
