import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { getAPIToken, getAuthFromEnv } from "../src/credentials";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "../src/auth-config-file";

/** An in-memory storage adapter for tests. */
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

describe("getAuthFromEnv", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns the API token from CLOUDFLARE_API_TOKEN", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-abc");
		expect(getAuthFromEnv()).toEqual({ apiToken: "token-abc" });
	});

	it("prefers the global API key + email over the API token by default", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-abc");
		vi.stubEnv("CLOUDFLARE_API_KEY", "global-key");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");
		expect(getAuthFromEnv()).toEqual({
			authKey: "global-key",
			authEmail: "user@example.com",
		});
	});

	it("ignores the global API key + email when allowGlobalAuthKey is false", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-abc");
		vi.stubEnv("CLOUDFLARE_API_KEY", "global-key");
		vi.stubEnv("CLOUDFLARE_EMAIL", "user@example.com");
		expect(getAuthFromEnv({ allowGlobalAuthKey: false })).toEqual({
			apiToken: "token-abc",
		});
	});

	it("returns undefined when no env credentials are present", ({ expect }) => {
		expect(getAuthFromEnv()).toBeUndefined();
	});
});

describe("getAPIToken", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("falls back to the stored OAuth token from the injected storage", ({
		expect,
	}) => {
		const storage = memoryStorage({
			oauth_token: "oauth-xyz",
			refresh_token: "refresh-xyz",
			expiration_time: "2099-01-01T00:00:00.000Z",
		});
		expect(getAPIToken({ storage })).toEqual({ apiToken: "oauth-xyz" });
	});

	it("prefers env credentials over the stored OAuth token", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "token-abc");
		const storage = memoryStorage({ oauth_token: "oauth-xyz" });
		expect(getAPIToken({ storage })).toEqual({ apiToken: "token-abc" });
	});

	it("returns undefined when neither env nor stored credentials exist", ({
		expect,
	}) => {
		expect(getAPIToken({ storage: memoryStorage() })).toBeUndefined();
	});
});
