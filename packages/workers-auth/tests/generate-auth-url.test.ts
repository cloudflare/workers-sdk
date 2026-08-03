import { describe, it } from "vitest";
import { generateAuthUrl } from "../src/generate-auth-url";

describe("generateAuthUrl redirectUri injection", () => {
	const base = {
		authUrl: "https://dash.cloudflare.com/oauth2/auth",
		clientId: "client-123",
		scopes: ["account:read"],
		stateQueryParam: "state-123",
		codeChallenge: "challenge-123",
	};

	it("includes the provided redirect_uri", ({ expect }) => {
		const redirectUri = "http://localhost:8976/oauth/callback";
		const url = generateAuthUrl({ ...base, redirectUri });
		expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
	});

	it("uses a different injected redirect_uri when provided", ({ expect }) => {
		const redirectUri = "http://localhost:8877/oauth/callback";
		const url = generateAuthUrl({ ...base, redirectUri });
		expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
	});
});
