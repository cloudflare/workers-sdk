import { fetch } from "undici";
import { describe, it } from "vitest";
import {
	getAuthOriginFromEnv,
	getClientIdFromEnv,
} from "../src/user/auth-variables";
import { generateAuthUrl } from "../src/user/generate-auth-url";
import { DefaultScopeKeys } from "../src/user/user";

describe("auth scopes", () => {
	it("default OAuth scopes are accepted by the Cloudflare backend", async ({
		expect,
	}) => {
		const url = generateAuthUrl({
			authOrigin: getAuthOriginFromEnv(),
			clientId: getClientIdFromEnv(),
			scopes: DefaultScopeKeys,
			stateQueryParam: "test-state",
			codeChallenge: "test-code-challenge",
		});

		const response = await fetch(url, { redirect: "manual" });

		expect(response.status).toBe(302);

		const location = response.headers.get("location");
		expect(location).toEqual(expect.any(String));
		expect(location).not.toContain("error=invalid_scope");
	});
});
