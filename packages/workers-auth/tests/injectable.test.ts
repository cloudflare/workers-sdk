import { describe, it } from "vitest";
import { generateAuthUrl, OAUTH_CALLBACK_URL } from "../src/generate-auth-url";
import { readStoredAuthState } from "../src/state";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "../src/auth-config-file";

function memoryStorage(initial?: UserAuthConfig): AuthConfigStorage {
	let value = initial;
	return {
		read() {
			if (value === undefined) {
				throw new Error("not logged in");
			}
			return value;
		},
		write(config) {
			value = config;
		},
		clear() {
			value = undefined;
		},
		path() {
			return "<memory>";
		},
	};
}

describe("generateAuthUrl redirectUri injection", () => {
	const base = {
		authUrl: "https://dash.cloudflare.com/oauth2/auth",
		clientId: "client-123",
		scopes: ["account:read"],
		stateQueryParam: "state-123",
		codeChallenge: "challenge-123",
	};

	it("defaults the redirect_uri to OAUTH_CALLBACK_URL", ({ expect }) => {
		const url = generateAuthUrl(base);
		expect(url).toContain(
			`redirect_uri=${encodeURIComponent(OAUTH_CALLBACK_URL)}`
		);
	});

	it("uses an injected redirect_uri when provided", ({ expect }) => {
		const redirectUri = "http://localhost:8877/oauth/callback";
		const url = generateAuthUrl({ ...base, redirectUri });
		expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
		expect(url).not.toContain(
			`redirect_uri=${encodeURIComponent(OAUTH_CALLBACK_URL)}`
		);
	});
});

describe("readStoredAuthState storage injection", () => {
	it("reads OAuth tokens from an injected storage backend", ({ expect }) => {
		const storage = memoryStorage({
			oauth_token: "oauth-xyz",
			refresh_token: "refresh-xyz",
			expiration_time: "2099-01-01T00:00:00.000Z",
			scopes: ["account:read"],
		});
		expect(readStoredAuthState({ storage })).toEqual({
			accessToken: {
				value: "oauth-xyz",
				expiry: "2099-01-01T00:00:00.000Z",
			},
			refreshToken: { value: "refresh-xyz" },
			scopes: ["account:read"],
		});
	});

	it("returns an empty object when the injected storage is empty", ({
		expect,
	}) => {
		expect(readStoredAuthState({ storage: memoryStorage() })).toEqual({});
	});
});
