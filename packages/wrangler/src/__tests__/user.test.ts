import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getGlobalWranglerConfigPath,
} from "@cloudflare/workers-utils";
import {
	normalizeString,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CI } from "../is-ci";
import {
	getAccountFromCache,
	getAccountId,
	getAuthConfigFilePath,
	getOAuthTokenFromLocalState,
	loginOrRefreshIfRequired,
	readAuthConfigFile,
	requireAuth,
	writeAuthConfigFile,
} from "../user";
import { mockConsoleMethods } from "./helpers/mock-console";
import { mockSelect } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import {
	mockExchangeRefreshTokenForAccessToken,
	mockGetMemberships,
	mockOAuthFlow,
} from "./helpers/mock-oauth-flow";
import {
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { UserAuthConfig } from "../user";
import type { Config } from "@cloudflare/workers-utils";
import type { MockInstance } from "vitest";

describe("User", () => {
	let isCISpy: MockInstance;
	runInTempDir();
	const std = mockConsoleMethods();
	// TODO: Implement these two mocks with MSW
	const { mockOAuthServerCallback } = mockOAuthFlow();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers, ...mswSuccessUserHandlers);
		isCISpy = vi.spyOn(CI, "isCI").mockReturnValue(false);
	});

	describe("login", () => {
		it("should login a user when `wrangler login` is run", async () => {
			mockOAuthServerCallback("success");

			let counter = 0;
			msw.use(
				http.post(
					"*/oauth2/token",
					async () => {
						counter += 1;

						return HttpResponse.json({
							access_token: "test-access-token",
							expires_in: 100000,
							refresh_token: "test-refresh-token",
							scope: "account:read",
						});
					},
					{ once: true }
				)
			);

			await runWrangler("login");

			expect(counter).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in."
			`);
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});

		it("should login a user when `wrangler login` is run with an ip address for custom callback-host", async () => {
			mockOAuthServerCallback("success");

			let counter = 0;
			msw.use(
				http.post(
					"*/oauth2/token",
					async () => {
						counter += 1;

						return HttpResponse.json({
							access_token: "test-access-token",
							expires_in: 100000,
							refresh_token: "test-refresh-token",
							scope: "account:read",
						});
					},
					{ once: true }
				)
			);

			await runWrangler("login --callback-host='0.0.0.0'");

			expect(counter).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Temporary login server listening on 0.0.0.0:8976
				Note that the OAuth login page will always redirect to \`localhost:8976\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in."
			`);
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});

		it("should login a user when `wrangler login` is run with a domain name for custom callback-host", async () => {
			mockOAuthServerCallback("success");

			let counter = 0;
			msw.use(
				http.post(
					"*/oauth2/token",
					async () => {
						counter += 1;

						return HttpResponse.json({
							access_token: "test-access-token",
							expires_in: 100000,
							refresh_token: "test-refresh-token",
							scope: "account:read",
						});
					},
					{ once: true }
				)
			);

			await runWrangler("login --callback-host='mylocalhost.local'");

			expect(counter).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Temporary login server listening on mylocalhost.local:8976
				Note that the OAuth login page will always redirect to \`localhost:8976\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in."
			`);
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});

		it("should login a user when `wrangler login` is run with custom callbackPort param", async () => {
			mockOAuthServerCallback("success");

			let counter = 0;
			msw.use(
				http.post(
					"*/oauth2/token",
					async () => {
						counter += 1;

						return HttpResponse.json({
							access_token: "test-access-token",
							expires_in: 100000,
							refresh_token: "test-refresh-token",
							scope: "account:read",
						});
					},
					{ once: true }
				)
			);

			await runWrangler("login --callback-port=8787");

			expect(counter).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Temporary login server listening on localhost:8787
				Note that the OAuth login page will always redirect to \`localhost:8976\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in."
			`);
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});

		it("login works in a different environment", async () => {
			vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");
			mockOAuthServerCallback("success");

			let counter = 0;
			msw.use(
				http.post(
					"*/oauth2/token",
					async () => {
						counter += 1;

						return HttpResponse.json({
							access_token: "test-access-token",
							expires_in: 100000,
							refresh_token: "test-refresh-token",
							scope: "account:read",
						});
					},
					{ once: true }
				)
			);

			await runWrangler("login");

			expect(counter).toBe(1);
			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Attempting to login via OAuth...
				Opening a link in your default browser: https://dash.staging.cloudflare.com/oauth2/auth?response_type=code&client_id=4b2ea6cc-9421-4761-874b-ce550e0e3def&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
				Successfully logged in."
			`);

			expect(normalizeString(getAuthConfigFilePath())).toBe(
				normalizeString(`${getGlobalWranglerConfigPath()}/config/staging.toml`)
			);
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});

		it('should error if the compliance region is not "public"', async () => {
			vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
			await expect(runWrangler("login")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			[Error: OAuth login is not supported in the \`fedramp_high\` compliance region.
			Please use a Cloudflare API token (\`CLOUDFLARE_API_TOKEN\` environment variable) or remove the \`CLOUDFLARE_API_ENVIRONMENT\` environment variable.]
		`);
		});
	});

	it("should handle errors for failed token refresh in a non-interactive environment", async () => {
		setIsTTY(false);
		writeAuthConfigFile({
			oauth_token: "hunter2",
			refresh_token: "Order 66",
		});
		mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshError" });

		// Handles the requireAuth error throw from failed login that is unhandled due to directly calling it here
		await expect(
			requireAuth({} as Config)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN environment variable for wrangler to work. Please go to https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ for instructions on how to create an api token, and assign its value to CLOUDFLARE_API_TOKEN.]`
		);
	});

	it("should confirm no error message when refresh is successful", async () => {
		setIsTTY(false);
		writeAuthConfigFile({
			oauth_token: "hunter2",
			refresh_token: "Order 66",
		});

		// Handles the requireAuth error throw from failed login that is unhandled due to directly calling it here
		await expect(requireAuth({} as Config)).rejects.toThrowError();
		expect(std.err).toContain("");
	});

	it("should revert to non-interactive mode if in CI", async () => {
		isCISpy.mockReturnValue(true);
		await expect(
			loginOrRefreshIfRequired(COMPLIANCE_REGION_CONFIG_UNKNOWN)
		).resolves.toEqual(false);
	});

	it("should revert to non-interactive mode if isTTY throws an error", async () => {
		setIsTTY({
			stdin() {
				throw new Error("stdin is not tty");
			},
			stdout: true,
		});
		await expect(
			loginOrRefreshIfRequired(COMPLIANCE_REGION_CONFIG_UNKNOWN)
		).resolves.toEqual(false);
	});

	it("should have auth per environment", async () => {
		setIsTTY(false);
		vi.stubEnv("WRANGLER_API_ENVIRONMENT", "staging");

		writeAuthConfigFile({
			oauth_token: "hunter2",
			refresh_token: "Order 66",
		});

		expect(normalizeString(getAuthConfigFilePath())).toBe(
			normalizeString(`${getGlobalWranglerConfigPath()}/config/staging.toml`)
		);
	});

	it("should not warn on invalid wrangler.toml when logging in", async () => {
		mockOAuthServerCallback("success");

		let counter = 0;
		msw.use(
			http.post(
				"*/oauth2/token",
				async () => {
					counter += 1;

					return HttpResponse.json({
						access_token: "test-access-token",
						expires_in: 100000,
						refresh_token: "test-refresh-token",
						scope: "account:read",
					});
				},
				{ once: true }
			)
		);

		// @ts-expect-error - intentionally invalid
		writeWranglerConfig({ invalid: true });

		await runWrangler("login");

		expect(counter).toBe(1);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Attempting to login via OAuth...
			Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
			Successfully logged in."
		`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
			api_token: undefined,
			oauth_token: "test-access-token",
			refresh_token: "test-refresh-token",
			expiration_time: expect.any(String),
			scopes: ["account:read"],
		});
	});

	describe("auth token", () => {
		it("should output the OAuth token when logged in with a valid token", async () => {
			// Set up a valid, non-expired token
			const futureDate = new Date(Date.now() + 100000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: futureDate,
				scopes: ["account:read"],
			});

			await runWrangler("auth token");

			expect(std.out).toContain("test-access-token");
		});

		it("should refresh and output the token when the token is expired", async () => {
			// Set up an expired token
			const pastDate = new Date(Date.now() - 100000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-token",
				refresh_token: "test-refresh-token",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});

			mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshSuccess" });

			await runWrangler("auth token");

			// The token should have been refreshed (mock returns "access_token_success_mock")
			expect(std.out).toContain("access_token_success_mock");
		});

		it("should error when not logged in", async () => {
			await expect(runWrangler("auth token")).rejects.toThrowError(
				"Not logged in. Please run `wrangler login` to authenticate."
			);
		});

		it("should output the API token from environment variable", async () => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-api-token");

			await runWrangler("auth token");

			expect(std.out).toContain("env-api-token");
		});

		it("should error when using global auth key/email without --json", async () => {
			vi.stubEnv("CLOUDFLARE_API_KEY", "test-api-key");
			vi.stubEnv("CLOUDFLARE_EMAIL", "test@example.com");

			await expect(runWrangler("auth token")).rejects.toThrowError(
				"Cannot output a single token when using CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL"
			);
		});

		it("should output JSON with key and email when using global auth key/email with --json", async () => {
			vi.stubEnv("CLOUDFLARE_API_KEY", "test-api-key");
			vi.stubEnv("CLOUDFLARE_EMAIL", "test@example.com");

			await runWrangler("auth token --json");

			const output = JSON.parse(std.out);
			expect(output).toEqual({
				type: "api_key",
				key: "test-api-key",
				email: "test@example.com",
			});
		});

		it("should output JSON with oauth type when logged in with --json", async () => {
			const futureDate = new Date(Date.now() + 100000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "test-access-token",
				refresh_token: "test-refresh-token",
				expiration_time: futureDate,
				scopes: ["account:read"],
			});

			await runWrangler("auth token --json");

			const output = JSON.parse(std.out);
			expect(output).toEqual({
				type: "oauth",
				token: "test-access-token",
			});
		});

		it("should output JSON with api_token type when using CLOUDFLARE_API_TOKEN with --json", async () => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-api-token");

			await runWrangler("auth token --json");

			const output = JSON.parse(std.out);
			expect(output).toEqual({
				type: "api_token",
				token: "env-api-token",
			});
		});

		it("should error when token refresh fails and user is not logged in", async () => {
			// Set up an expired token with a refresh token that will fail
			const pastDate = new Date(Date.now() - 100000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-token",
				refresh_token: "invalid-refresh-token",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});

			mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshError" });

			await expect(runWrangler("auth token")).rejects.toThrowError(
				"Not logged in. Please run `wrangler login` to authenticate."
			);
		});
	});

	describe("getOAuthTokenFromLocalState", () => {
		it("should return undefined when not logged in", async () => {
			const token = await getOAuthTokenFromLocalState();
			expect(token).toBeUndefined();
		});

		it("should return the OAuth token when logged in with a valid token", async () => {
			const futureDate = new Date(Date.now() + 100000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "test-oauth-token",
				refresh_token: "test-refresh-token",
				expiration_time: futureDate,
				scopes: ["account:read"],
			});

			const token = await getOAuthTokenFromLocalState();
			expect(token).toBe("test-oauth-token");
		});

		it("should refresh and return the token when expired", async () => {
			const pastDate = new Date(Date.now() - 100000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-token",
				refresh_token: "test-refresh-token",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});

			mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshSuccess" });

			const token = await getOAuthTokenFromLocalState();
			// Mock returns "access_token_success_mock" for refreshSuccess
			expect(token).toBe("access_token_success_mock");
		});

		it("should return undefined when token refresh fails", async () => {
			const pastDate = new Date(Date.now() - 100000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-token",
				refresh_token: "invalid-refresh-token",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});

			mockExchangeRefreshTokenForAccessToken({ respondWith: "refreshError" });

			const token = await getOAuthTokenFromLocalState();
			expect(token).toBeUndefined();
		});
	});

	describe("account caching", () => {
		beforeEach(() => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-api-token");
		});

		it("should only prompt for account selection once when getAccountId is called multiple times", async () => {
			setIsTTY(true);

			// Mock the memberships API to return multiple accounts
			// Note: mockGetMemberships uses { once: true }, so we need to set it up for each expected call
			// But since we're testing caching, the second call should NOT hit the API
			mockGetMemberships([
				{
					id: "membership-1",
					account: { id: "account-1", name: "Account One" },
				},
				{
					id: "membership-2",
					account: { id: "account-2", name: "Account Two" },
				},
			]);

			// Mock the select dialog - should only be called once
			mockSelect({
				text: "Select an account",
				result: "account-1",
			});

			// First call - should prompt for account selection
			const firstAccountId = await getAccountId({});
			expect(firstAccountId).toBe("account-1");

			// Verify account is cached
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toEqual({ id: "account-1", name: "Account One" });

			// Second call - should use cached account, not prompt again
			const secondAccountId = await getAccountId({});
			expect(secondAccountId).toBe("account-1");

			// Third call - should still use cached account
			const thirdAccountId = await getAccountId({});
			expect(thirdAccountId).toBe("account-1");

			// If mockSelect was called more than once, the test would fail because
			// we only set up one expectation and prompts mock throws on unexpected calls
		});

		it("should use account_id from config without prompting", async () => {
			// When config has account_id, it should be used directly without prompting
			const accountId = await getAccountId({ account_id: "config-account-id" });
			expect(accountId).toBe("config-account-id");

			// Cache should not be populated when using config account_id
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toBeUndefined();
		});

		it("should cache account when only one account is available (no prompt needed)", async () => {
			// Mock single account - no prompt needed
			mockGetMemberships([
				{
					id: "membership-1",
					account: { id: "single-account", name: "Only Account" },
				},
			]);

			const accountId = await getAccountId({});
			expect(accountId).toBe("single-account");

			// Account should still be cached even without prompting
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toEqual({
				id: "single-account",
				name: "Only Account",
			});

			// Set up another membership response for verification
			// (won't be called because cache is used)
			mockGetMemberships([
				{
					id: "membership-2",
					account: { id: "different-account", name: "Different" },
				},
			]);

			// Second call should use cache
			const secondAccountId = await getAccountId({});
			expect(secondAccountId).toBe("single-account");
		});
	});
});
