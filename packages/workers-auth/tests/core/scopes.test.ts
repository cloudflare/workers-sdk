import { describe, it } from "vitest";
import { validateScopeKeys } from "../../src/core/scopes";
import { generateAuthUrl } from "../../src/generate-auth-url";
import { WRANGLER_CLI } from "../../src/wrangler";

describe("K2 OAuth scopes", () => {
	it("requests K2 management access alongside the ordinary Wrangler scopes", ({
		expect,
	}) => {
		const url = new URL(
			generateAuthUrl({
				authUrl: "https://dash.cloudflare.com/oauth2/auth",
				clientId: "test-client",
				scopes: WRANGLER_CLI.getDefaultScopeKeys(),
				stateQueryParam: "test-state",
				codeChallenge: "test-challenge",
				redirectUri: WRANGLER_CLI.redirectUri,
			})
		);
		expect(url.searchParams.get("scope")?.split(" ")).toEqual(
			expect.arrayContaining([
				"k2.read",
				"k2.write",
				"workers_scripts:write",
				"pipelines:write",
				"offline_access",
			])
		);
		expect(validateScopeKeys(["k2.read", "k2.write"])).toBe(true);
		expect(validateScopeKeys(["k2:read"])).toBe(false);
	});
});
