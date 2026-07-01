import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	getAuthDomainFromEnv,
	getCfAuthorizationTokenFromEnv,
	getClientIdFromEnv,
	getTokenUrlFromEnv,
} from "../src/env-vars";

describe("getClientIdFromEnv", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		// Ensure a deterministic (production) default with the client-id vars unset.
		vi.stubEnv("CLOUDFLARE_API_ENVIRONMENT", "production");
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "production");
		vi.stubEnv("CLOUDFLARE_OAUTH_CLIENT_ID", undefined);
		vi.stubEnv("WRANGLER_CLIENT_ID", undefined);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to wrangler's production OAuth app", ({ expect }) => {
		expect(getClientIdFromEnv()).toBe("54d11594-84e4-41aa-b438-e81b8fa78ee7");
	});

	it("honours WRANGLER_CLIENT_ID", ({ expect }) => {
		vi.stubEnv("WRANGLER_CLIENT_ID", "wrangler-app-id");
		expect(getClientIdFromEnv()).toBe("wrangler-app-id");
	});

	it("prefers the CLI-neutral CLOUDFLARE_OAUTH_CLIENT_ID over WRANGLER_CLIENT_ID", ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_CLIENT_ID", "wrangler-app-id");
		vi.stubEnv("CLOUDFLARE_OAUTH_CLIENT_ID", "cf-app-id");
		expect(getClientIdFromEnv()).toBe("cf-app-id");
	});
});

describe("OAuth domain env vars (neutral aliases)", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("getAuthDomainFromEnv", () => {
		it("defaults to the production dash domain", ({ expect }) => {
			expect(getAuthDomainFromEnv()).toBe("dash.cloudflare.com");
		});

		it("switches to staging via CLOUDFLARE_API_ENVIRONMENT", ({ expect }) => {
			vi.stubEnv("CLOUDFLARE_API_ENVIRONMENT", "staging");
			expect(getAuthDomainFromEnv()).toBe("dash.staging.cloudflare.com");
		});

		it("switches to staging via WRANGLER_API_ENVIRONMENT", ({ expect }) => {
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			expect(getAuthDomainFromEnv()).toBe("dash.staging.cloudflare.com");
		});

		it("prefers the CLI-neutral CLOUDFLARE_AUTH_DOMAIN over WRANGLER_AUTH_DOMAIN", ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_AUTH_DOMAIN", "wrangler.example.com");
			vi.stubEnv("CLOUDFLARE_AUTH_DOMAIN", "cf.example.com");
			expect(getAuthDomainFromEnv()).toBe("cf.example.com");
		});
	});

	describe("getTokenUrlFromEnv", () => {
		it("derives from the (neutral) staging auth domain", ({ expect }) => {
			vi.stubEnv("CLOUDFLARE_API_ENVIRONMENT", "staging");
			expect(getTokenUrlFromEnv()).toBe(
				"https://dash.staging.cloudflare.com/oauth2/token"
			);
		});

		it("prefers the CLI-neutral CLOUDFLARE_TOKEN_URL over WRANGLER_TOKEN_URL", ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_TOKEN_URL", "https://wrangler.example.com/token");
			vi.stubEnv("CLOUDFLARE_TOKEN_URL", "https://cf.example.com/token");
			expect(getTokenUrlFromEnv()).toBe("https://cf.example.com/token");
		});
	});

	describe("getCfAuthorizationTokenFromEnv", () => {
		it("is undefined when neither var is set", ({ expect }) => {
			expect(getCfAuthorizationTokenFromEnv()).toBeUndefined();
		});

		it("prefers CLOUDFLARE_CF_AUTHORIZATION_TOKEN over the wrangler var", ({
			expect,
		}) => {
			vi.stubEnv("WRANGLER_CF_AUTHORIZATION_TOKEN", "wrangler-cookie");
			vi.stubEnv("CLOUDFLARE_CF_AUTHORIZATION_TOKEN", "cf-cookie");
			expect(getCfAuthorizationTokenFromEnv()).toBe("cf-cookie");
		});
	});
});
