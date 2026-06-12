import fs from "node:fs";
import path from "node:path";
import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getGlobalWranglerConfigPath,
} from "@cloudflare/workers-utils";
import {
	normalizeString,
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import ci from "ci-info";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { saveToConfigCache } from "../config-cache";
import {
	fetchAllAccounts,
	getAccountFromCache,
	getActiveAccountId,
	getAPIToken,
	getAuthConfigFilePath,
	getOAuthTokenFromLocalState,
	getOrSelectAccountId,
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
	mockOAuthFlow,
} from "./helpers/mock-oauth-flow";
import {
	createFetchResult,
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { getMswSuccessMembershipHandlers } from "./helpers/msw/handlers/user";
import { runWrangler } from "./helpers/run-wrangler";
import type { UserAuthConfig } from "../user";
import type { Config } from "@cloudflare/workers-utils";

describe("User", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	// TODO: Implement these two mocks with MSW
	const { mockOAuthServerCallback } = mockOAuthFlow();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		msw.use(...mswSuccessOauthHandlers, ...mswSuccessUserHandlers);
	});

	describe("login", () => {
		it("should login a user when `wrangler login` is run", async ({
			expect,
		}) => {
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
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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

		it("should clear the cached temporary preview account when logging in", async ({
			expect,
		}) => {
			// Resolve the path inside the test so it picks up the HOME/XDG_CONFIG_HOME
			// stubs set by runInTempDir's beforeEach, rather than the real homedir.
			const temporaryAccountConfigPath = path.join(
				getGlobalWranglerConfigPath(),
				"wrangler-temporary-account.toml"
			);

			mockOAuthServerCallback("success");

			fs.mkdirSync(path.dirname(temporaryAccountConfigPath), {
				recursive: true,
			});
			fs.writeFileSync(
				temporaryAccountConfigPath,
				JSON.stringify({ temporaryPreviewAccount: { account: {}, claim: {} } })
			);

			msw.use(
				http.post(
					"*/oauth2/token",
					async () => {
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

			expect(fs.existsSync(temporaryAccountConfigPath)).toBe(true);

			await runWrangler("login");

			expect(fs.existsSync(temporaryAccountConfigPath)).toBe(false);
		});

		it("should login a user when `wrangler login` is run with an ip address for custom callback-host", async ({
			expect,
		}) => {
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
				Note that the OAuth login page will always redirect to \`http://localhost:8976/oauth/callback\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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

		it("should login a user when `wrangler login` is run with a domain name for custom callback-host", async ({
			expect,
		}) => {
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
				Note that the OAuth login page will always redirect to \`http://localhost:8976/oauth/callback\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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

		it("should login a user when `wrangler login` is run with custom callbackPort param", async ({
			expect,
		}) => {
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
				Note that the OAuth login page will always redirect to \`http://localhost:8976/oauth/callback\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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

		it("login works in a different environment", async ({ expect }) => {
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
				Opening a link in your default browser: https://dash.staging.cloudflare.com/oauth2/auth?response_type=code&client_id=4b2ea6cc-9421-4761-874b-ce550e0e3def&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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

		it('should error if the compliance region is not "public"', async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_COMPLIANCE_REGION", "fedramp_high");
			await expect(runWrangler("login")).rejects
				.toThrowErrorMatchingInlineSnapshot(`
			[Error: OAuth login is not supported in the \`fedramp_high\` compliance region.
			Please use a Cloudflare API token (\`CLOUDFLARE_API_TOKEN\` environment variable) or remove the \`CLOUDFLARE_API_ENVIRONMENT\` environment variable.]
		`);
		});

		// Regression coverage for the OAuth callback hang. When the OAuth
		// provider redirected to `/oauth/callback?error=...` with any error
		// other than `access_denied`, Wrangler used to never write a response,
		// causing `server.close()` to wait forever for the connection to drain
		// and the login command to hang until the 120s OAuth timeout. The
		// tightened `mock-http-server.ts` faithfully reproduces those
		// production semantics, so a regression would cause these tests to
		// fail at the vitest test timeout rather than passing by accident.
		describe("OAuth callback error handling", () => {
			it("rejects with the bare OAuth error code when no description is provided", async ({
				expect,
			}) => {
				mockOAuthServerCallback({ error: "invalid_scope" });

				await expect(
					runWrangler("login")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: OAuth error: invalid_scope]`
				);
			});

			it("rejects with both the OAuth error code and error_description", async ({
				expect,
			}) => {
				mockOAuthServerCallback({
					error: "invalid_scope",
					error_description:
						"The OAuth 2.0 Client is not allowed to request scope 'browser:write'.",
				});

				await expect(runWrangler("login")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: OAuth error: invalid_scope
					  The OAuth 2.0 Client is not allowed to request scope 'browser:write'.]
				`);
			});

			it("rejects with the existing consent-denied message for access_denied", async ({
				expect,
			}) => {
				mockOAuthServerCallback({ error: "access_denied" });

				await expect(runWrangler("login")).rejects
					.toThrowErrorMatchingInlineSnapshot(`
					[Error: Error: Consent denied. You must grant consent to Wrangler in order to login.
					If you don't want to do this consider passing an API token via the \`CLOUDFLARE_API_TOKEN\` environment variable]
				`);
			});

			it("rejects with the provider error when /oauth2/token fails after a valid auth code", async ({
				expect,
			}) => {
				mockOAuthServerCallback("success");
				msw.use(
					http.post(
						"*/oauth2/token",
						() =>
							HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
						{ once: true }
					)
				);

				await expect(
					runWrangler("login")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: OAuth error: invalid_grant]`
				);
			});

			it("rejects with the provider error when /oauth2/token returns 2xx with an error body", async ({
				expect,
			}) => {
				// Defensive handling of the (non-standard) case where the token
				// endpoint returns a success status but the body still carries an
				// OAuth `error` field. The error should still be surfaced via
				// `toErrorClass` rather than as a plain `Error`.
				mockOAuthServerCallback("success");
				msw.use(
					http.post(
						"*/oauth2/token",
						() => HttpResponse.json({ error: "invalid_token" }),
						{ once: true }
					)
				);

				await expect(
					runWrangler("login")
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: OAuth error: invalid_token]`
				);
			});
		});
	});

	it("should handle errors for failed token refresh in a non-interactive environment", async ({
		expect,
	}) => {
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

	it("should confirm no error message when refresh is successful", async ({
		expect,
	}) => {
		setIsTTY(false);
		writeAuthConfigFile({
			oauth_token: "hunter2",
			refresh_token: "Order 66",
		});

		// Handles the requireAuth error throw from failed login that is unhandled due to directly calling it here
		await expect(requireAuth({} as Config)).rejects.toThrowError();
		expect(std.err).toContain("");
	});

	it("should revert to non-interactive mode if in CI", async ({ expect }) => {
		vi.mocked(ci).isCI = true;
		await expect(
			loginOrRefreshIfRequired(COMPLIANCE_REGION_CONFIG_UNKNOWN)
		).resolves.toEqual({
			loggedIn: false,
			reason: "no-credentials-non-interactive",
		});
	});

	it("should revert to non-interactive mode if isTTY throws an error", async ({
		expect,
	}) => {
		setIsTTY({
			stdin() {
				throw new Error("stdin is not tty");
			},
			stdout: true,
		});
		await expect(
			loginOrRefreshIfRequired(COMPLIANCE_REGION_CONFIG_UNKNOWN)
		).resolves.toEqual({
			loggedIn: false,
			reason: "no-credentials-non-interactive",
		});
	});

	describe("CLOUDFLARE_API_TOKEN priority over stored OAuth state", () => {
		// Regression coverage for https://github.com/cloudflare/workers-sdk/issues/13744
		//
		// A user may legitimately have both:
		//   - A `CLOUDFLARE_API_TOKEN` set in the environment (typically via `.env`)
		//   - A stale OAuth token left over from a previous `wrangler login`
		//
		// The env-based API token should win unconditionally — the stored OAuth
		// state should not even be consulted, let alone refreshed.

		it("getAPIToken returns the env token even when a stored OAuth token also exists", ({
			expect,
		}) => {
			writeAuthConfigFile({
				oauth_token: "stale-oauth",
				refresh_token: "stale-refresh",
				expiration_time: new Date(Date.now() + 100_000 * 1000).toISOString(),
				scopes: ["account:read"],
			});
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");

			expect(getAPIToken()).toEqual({ apiToken: "env-token" });
		});

		it("loginOrRefreshIfRequired does not attempt to refresh an expired OAuth token when env auth is set", async ({
			expect,
		}) => {
			// Stored OAuth token is expired. Without the fix, wrangler would try to
			// refresh it (and fail), aborting the command even though env auth is
			// valid and available.
			const pastDate = new Date(Date.now() - 100_000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-oauth",
				refresh_token: "stale-refresh",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");

			let oauthRefreshCalled = false;
			msw.use(
				http.post("*/oauth2/token", () => {
					oauthRefreshCalled = true;
					return new HttpResponse(null, { status: 400 });
				})
			);

			await expect(
				loginOrRefreshIfRequired(COMPLIANCE_REGION_CONFIG_UNKNOWN)
			).resolves.toEqual({ loggedIn: true });
			expect(oauthRefreshCalled).toBe(false);
		});

		it("wrangler whoami succeeds via env token when a stale OAuth token also exists on disk", async ({
			expect,
		}) => {
			// End-to-end reproduction of issue #13744. With the bug, this command
			// would fail with "Failed to fetch auth token: 400 Bad Request" /
			// "Not logged in." Now it should succeed using the env token.
			const pastDate = new Date(Date.now() - 100_000 * 1000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-oauth",
				refresh_token: "stale-refresh",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");

			let oauthRefreshCalled = false;
			msw.use(
				http.post("*/oauth2/token", () => {
					oauthRefreshCalled = true;
					return new HttpResponse(null, { status: 400 });
				}),
				http.get("*/user/tokens/verify", () =>
					HttpResponse.json(createFetchResult([]))
				)
			);

			await runWrangler("whoami");

			expect(std.err).toBe("");
			expect(std.out).toContain(
				"The API Token is read from the CLOUDFLARE_API_TOKEN environment variable."
			);
			expect(oauthRefreshCalled).toBe(false);
		});
	});

	it("should have auth per environment", async ({ expect }) => {
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

	it("should not warn on invalid wrangler.toml when logging in", async ({
		expect,
	}) => {
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
			Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20websearch.run%20agent-memory%3Awrite%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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
		it("should output the OAuth token when logged in with a valid token", async ({
			expect,
		}) => {
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

		it("should refresh and output the token when the token is expired", async ({
			expect,
		}) => {
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

		it("should re-read refresh_token from disk before refreshing in case a sibling process rotated it", async ({
			expect,
		}) => {
			// Bug repro: when a long-lived wrangler process (e.g. `wrangler dev`) holds a
			// refresh_token from a snapshot of disk, and a sibling wrangler invocation
			// rotates the token on disk, the long-lived process's next refresh must
			// pick up the rotated token rather than send the stale RT and get a 401.
			// See real-world logs: same RT sent by two processes 60min apart, second 401'd.
			setIsTTY(false);

			// Sibling process has already rotated RT_A → RT_B on disk, but the access
			// token written alongside is also expired (so a refresh is still needed).
			// This simulates: our process started up with RT_A, time passes, the
			// sibling rotates, then our process tries to refresh.
			const pastDate = new Date(Date.now() - 100_000_000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-access",
				refresh_token: "RT_B",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});

			// CF token endpoint: stale RT_A returns 401, current RT_B succeeds.
			// Matches the exact failure mode observed in production logs.
			msw.use(
				http.post("*/oauth2/token", async ({ request }) => {
					const body = new URLSearchParams(await request.text());
					const rt = body.get("refresh_token");
					if (rt === "RT_A") {
						return new HttpResponse(null, {
							status: 401,
							statusText: "Unauthorized",
						});
					}
					return HttpResponse.json({
						access_token: "fresh-access-token",
						expires_in: 3600,
						refresh_token: "RT_B_NEXT",
						scope: "account:read",
						token_type: "bearer",
					});
				})
			);

			// readStoredAuthState() reads the auth config file on every call, so
			// exchangeRefreshTokenForAccessToken picks up RT_B written by the
			// "sibling" process and the command prints the fresh access token.
			await runWrangler("auth token");
			expect(std.out).toContain("fresh-access-token");
		});

		it("should preserve the stored refresh_token when the OAuth server omits one on refresh", async ({
			expect,
		}) => {
			// RFC 6749 §6 allows the authorization server to return a successful
			// refresh response without a new refresh_token; the previously issued
			// refresh token then remains valid. Wrangler must keep that stored
			// refresh token on disk rather than wiping it — otherwise the next
			// refresh attempt fails with "No refresh token is present" and the
			// user is effectively logged out.
			setIsTTY(false);
			const pastDate = new Date(Date.now() - 100_000_000).toISOString();
			writeAuthConfigFile({
				oauth_token: "expired-access",
				refresh_token: "RT_A",
				expiration_time: pastDate,
				scopes: ["account:read"],
			});

			msw.use(
				http.post("*/oauth2/token", () =>
					HttpResponse.json({
						access_token: "fresh-access-token",
						expires_in: 3600,
						// no refresh_token in the response
						scope: "account:read",
						token_type: "bearer",
					})
				)
			);

			await runWrangler("auth token");

			expect(std.out).toContain("fresh-access-token");
			expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
				api_token: undefined,
				oauth_token: "fresh-access-token",
				refresh_token: "RT_A",
				expiration_time: expect.any(String),
				scopes: ["account:read"],
			});
		});

		it("should error when not logged in", async ({ expect }) => {
			await expect(runWrangler("auth token")).rejects.toThrowError(
				"Not logged in. Please run `wrangler login` to authenticate."
			);
		});

		it("should output the API token from environment variable", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-api-token");

			await runWrangler("auth token");

			expect(std.out).toContain("env-api-token");
		});

		it("should error when using global auth key/email without --json", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_API_KEY", "test-api-key");
			vi.stubEnv("CLOUDFLARE_EMAIL", "test@example.com");

			await expect(runWrangler("auth token")).rejects.toThrowError(
				"Cannot output a single token when using CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL"
			);
		});

		it("should output JSON with key and email when using global auth key/email with --json", async ({
			expect,
		}) => {
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

		it("should output JSON with oauth type when logged in with --json", async ({
			expect,
		}) => {
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

		it("should output JSON with api_token type when using CLOUDFLARE_API_TOKEN with --json", async ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-api-token");

			await runWrangler("auth token --json");

			const output = JSON.parse(std.out);
			expect(output).toEqual({
				type: "api_token",
				token: "env-api-token",
			});
		});

		it("should error when token refresh fails and user is not logged in", async ({
			expect,
		}) => {
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
		it("should return undefined when not logged in", async ({ expect }) => {
			const token = await getOAuthTokenFromLocalState();
			expect(token).toBeUndefined();
		});

		it("should return the OAuth token when logged in with a valid token", async ({
			expect,
		}) => {
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

		it("should refresh and return the token when expired", async ({
			expect,
		}) => {
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

		it("should return undefined when token refresh fails", async ({
			expect,
		}) => {
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

		it("should only prompt for account selection once when getOrSelectAccountId is called multiple times", async ({
			expect,
		}) => {
			setIsTTY(true);

			// Mock the memberships API to return multiple accounts
			// Note: getMswSuccessMembershipHandlers uses { once: true }, so we need to set it up for each expected call
			// But since we're testing caching, the second call should NOT hit the API
			msw.use(
				...getMswSuccessMembershipHandlers([
					{ id: "account-1", name: "Account One" },
					{ id: "account-2", name: "Account Two" },
				])
			);

			// Mock the select dialog - should only be called once
			mockSelect({
				text: "Select an account",
				result: "account-1",
			});

			// First call - should prompt for account selection
			const firstAccountId = await getOrSelectAccountId({});
			expect(firstAccountId).toBe("account-1");

			// Verify account is cached
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toEqual({ id: "account-1", name: "Account One" });

			// Second call - should use cached account, not prompt again
			const secondAccountId = await getOrSelectAccountId({});
			expect(secondAccountId).toBe("account-1");

			// Third call - should still use cached account
			const thirdAccountId = await getOrSelectAccountId({});
			expect(thirdAccountId).toBe("account-1");

			// If mockSelect was called more than once, the test would fail because
			// we only set up one expectation and prompts mock throws on unexpected calls
		});

		it("should use account_id from config without prompting", async ({
			expect,
		}) => {
			// When config has account_id, it should be used directly without prompting
			const accountId = await getOrSelectAccountId({
				account_id: "config-account-id",
			});
			expect(accountId).toBe("config-account-id");

			// Cache should not be populated when using config account_id
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toBeUndefined();
		});

		it("should cache account when only one account is available (no prompt needed)", async ({
			expect,
		}) => {
			// Mock single account - no prompt needed
			msw.use(
				...getMswSuccessMembershipHandlers([
					{ id: "single-account", name: "Only Account" },
				])
			);

			const accountId = await getOrSelectAccountId({});
			expect(accountId).toBe("single-account");

			// Account should still be cached even without prompting
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toEqual({
				id: "single-account",
				name: "Only Account",
			});

			// Set up another membership response for verification
			// (won't be called because cache is used)
			msw.use(
				...getMswSuccessMembershipHandlers([
					{ id: "different-account", name: "Different" },
				])
			);

			// Second call should use cache
			const secondAccountId = await getOrSelectAccountId({});
			expect(secondAccountId).toBe("single-account");
		});
	});

	describe("getActiveAccountId", () => {
		it("should return config.account_id when set", ({ expect }) => {
			const result = getActiveAccountId({ account_id: "from-config" });
			expect(result).toBe("from-config");
		});

		it("should return CLOUDFLARE_ACCOUNT_ID env var when config has no account_id", ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "from-env");
			const result = getActiveAccountId({});
			expect(result).toBe("from-env");
		});

		it("should prefer config.account_id over env var and cache", ({
			expect,
		}) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "from-env");
			// Prime the cache via the config cache file
			saveToConfigCache("wrangler-account.json", {
				account: { id: "from-cache", name: "Cached Account" },
			});

			const result = getActiveAccountId({ account_id: "from-config" });
			expect(result).toBe("from-config");
		});

		it("should prefer env var over cache", ({ expect }) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "from-env");
			saveToConfigCache("wrangler-account.json", {
				account: { id: "from-cache", name: "Cached Account" },
			});

			const result = getActiveAccountId({});
			expect(result).toBe("from-env");
		});

		it("should return cached account when config and env var are not set", ({
			expect,
		}) => {
			saveToConfigCache("wrangler-account.json", {
				account: { id: "from-cache", name: "Cached Account" },
			});

			const result = getActiveAccountId({});
			expect(result).toBe("from-cache");
		});

		it("should return undefined when no source is available", ({ expect }) => {
			const result = getActiveAccountId({});
			expect(result).toBeUndefined();
		});
	});

	describe("fetchAllAccounts", () => {
		beforeEach(() => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-api-token");
		});

		it("should return the intersection of /accounts and /memberships", async ({
			expect,
		}) => {
			msw.use(
				...getMswSuccessMembershipHandlers([
					{ id: "account-1", name: "Account One" },
					{ id: "account-2", name: "Account Two" },
				])
			);

			const accounts = await fetchAllAccounts({});
			expect(accounts).toEqual([
				{ id: "account-1", name: "Account One" },
				{ id: "account-2", name: "Account Two" },
			]);
		});

		it("should drop accounts present in /accounts but not /memberships", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts",
					() =>
						HttpResponse.json(
							createFetchResult([
								{ id: "account-1", name: "Account One" },
								{ id: "account-2", name: "Account Two" },
								{ id: "account-3", name: "Orphan account" },
							])
						),
					{ once: true }
				),
				http.get(
					"*/memberships",
					() =>
						HttpResponse.json(
							createFetchResult([
								{
									id: "membership-1",
									account: { id: "account-1", name: "Account One" },
								},
								{
									id: "membership-2",
									account: { id: "account-2", name: "Account Two" },
								},
							])
						),
					{ once: true }
				)
			);

			const accounts = await fetchAllAccounts({});
			expect(accounts).toEqual([
				{ id: "account-1", name: "Account One" },
				{ id: "account-2", name: "Account Two" },
			]);
		});

		it("should drop accounts present in /memberships but not /accounts", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts",
					() =>
						HttpResponse.json(
							createFetchResult([{ id: "account-1", name: "Account One" }])
						),
					{ once: true }
				),
				http.get(
					"*/memberships",
					() =>
						HttpResponse.json(
							createFetchResult([
								{
									id: "membership-1",
									account: { id: "account-1", name: "Account One" },
								},
								{
									id: "membership-2",
									account: { id: "account-2", name: "Phantom account" },
								},
							])
						),
					{ once: true }
				)
			);

			const accounts = await fetchAllAccounts({});
			expect(accounts).toEqual([{ id: "account-1", name: "Account One" }]);
		});

		it("should throw when no accounts are found", async ({ expect }) => {
			msw.use(...getMswSuccessMembershipHandlers([]));

			await expect(fetchAllAccounts({})).rejects.toThrowError(
				/Failed to automatically retrieve account IDs for the logged in user/
			);
		});

		it("should throw when /accounts and /memberships have no overlap", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts",
					() =>
						HttpResponse.json(
							createFetchResult([{ id: "account-1", name: "Account One" }])
						),
					{ once: true }
				),
				http.get(
					"*/memberships",
					() =>
						HttpResponse.json(
							createFetchResult([
								{
									id: "membership-1",
									account: { id: "account-2", name: "Account Two" },
								},
							])
						),
					{ once: true }
				)
			);

			await expect(fetchAllAccounts({})).rejects.toThrowError(
				/Failed to automatically retrieve account IDs for the logged in user/
			);
		});

		it("should fall back to /accounts when /memberships returns 9106 (Account API Token path)", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts",
					() =>
						HttpResponse.json(
							createFetchResult([
								{ id: "account-only", name: "Single Account" },
							])
						),
					{ once: true }
				),
				http.get(
					"*/memberships",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [
								{
									code: 9106,
									message: "Authentication failed (status: 400)",
								},
							],
							result: null,
						});
					},
					{ once: true }
				)
			);

			const accounts = await fetchAllAccounts({});
			expect(accounts).toEqual([
				{ id: "account-only", name: "Single Account" },
			]);
		});

		it("should throw a helpful error on 9106 when /accounts is also unusable", async ({
			expect,
		}) => {
			msw.use(
				http.get("*/accounts", () => HttpResponse.json(createFetchResult([])), {
					once: true,
				}),
				http.get(
					"*/memberships",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [
								{
									code: 9106,
									message: "Authentication failed (status: 400)",
								},
							],
							result: null,
						});
					},
					{ once: true }
				)
			);

			await expect(fetchAllAccounts({})).rejects.toThrowError(
				/incorrect permissions on your API token/
			);
		});

		it("should fall back to /accounts when /memberships returns 10000 (Authentication error)", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/accounts",
					() =>
						HttpResponse.json(
							createFetchResult([
								{ id: "account-1", name: "Account One" },
								{ id: "account-2", name: "Account Two" },
							])
						),
					{ once: true }
				),
				http.get(
					"*/memberships",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [{ code: 10000, message: "Authentication error" }],
							result: null,
						});
					},
					{ once: true }
				)
			);

			const accounts = await fetchAllAccounts({});
			expect(accounts).toEqual([
				{ id: "account-1", name: "Account One" },
				{ id: "account-2", name: "Account Two" },
			]);
		});

		it("should throw a helpful error on 10000 when /accounts is also unusable", async ({
			expect,
		}) => {
			msw.use(
				http.get("*/accounts", () => HttpResponse.json(createFetchResult([])), {
					once: true,
				}),
				http.get(
					"*/memberships",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [{ code: 10000, message: "Authentication error" }],
							result: null,
						});
					},
					{ once: true }
				)
			);

			await expect(fetchAllAccounts({})).rejects.toThrowError(
				/incorrect permissions on your API token/
			);
		});

		it("should include env-var hint when /memberships returns 9106 and /accounts is empty", async ({
			expect,
		}) => {
			msw.use(
				http.get("*/accounts", () => HttpResponse.json(createFetchResult([])), {
					once: true,
				}),
				http.get(
					"*/memberships",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [
								{
									code: 9106,
									message: "Authentication failed",
								},
							],
							result: null,
						});
					},
					{ once: true }
				)
			);

			await expect(fetchAllAccounts({})).rejects.toThrowError(
				/CLOUDFLARE_API_TOKEN/
			);
		});

		it("should propagate /memberships errors that are not 9106 or 10000", async ({
			expect,
		}) => {
			msw.use(
				http.get(
					"*/memberships",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [{ code: 1003, message: "Invalid something" }],
							result: null,
						});
					},
					{ once: true }
				)
			);

			await expect(fetchAllAccounts({})).rejects.toThrowError(
				/A request to the Cloudflare API \(\/memberships\) failed/
			);
		});

		it("should return an empty array instead of throwing when throwOnEmpty is false", async ({
			expect,
		}) => {
			msw.use(...getMswSuccessMembershipHandlers([]));

			const accounts = await fetchAllAccounts({}, { throwOnEmpty: false });
			expect(accounts).toEqual([]);
		});
	});

	describe("getOrSelectAccountId with env var", () => {
		beforeEach(() => {
			vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-api-token");
		});

		it("should return env var without making API calls", async ({ expect }) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-account-id");

			// No getMswSuccessMembershipHandlers — if an API call is made, it will fail
			const accountId = await getOrSelectAccountId({});
			expect(accountId).toBe("env-account-id");
		});

		it("should prefer env var over cached account", async ({ expect }) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-account-id");
			saveToConfigCache("wrangler-account.json", {
				account: { id: "cached-account-id", name: "Cached Account" },
			});

			const accountId = await getOrSelectAccountId({});
			expect(accountId).toBe("env-account-id");
		});

		it("should not write to cache when using env var", async ({ expect }) => {
			vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "env-account-id");

			const accountId = await getOrSelectAccountId({});
			expect(accountId).toBe("env-account-id");

			// Cache should remain empty — env var path is side-effect-free
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toBeUndefined();
		});

		it("should not write to cache when using config account_id", async ({
			expect,
		}) => {
			const accountId = await getOrSelectAccountId({
				account_id: "config-account-id",
			});
			expect(accountId).toBe("config-account-id");

			// Cache should remain empty — config path is side-effect-free
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toBeUndefined();
		});

		it("should write to cache when account is resolved via API", async ({
			expect,
		}) => {
			msw.use(
				...getMswSuccessMembershipHandlers([
					{ id: "api-account", name: "API Account" },
				])
			);

			const accountId = await getOrSelectAccountId({});
			expect(accountId).toBe("api-account");

			// Cache should be populated from the API path
			const cachedAccount = getAccountFromCache();
			expect(cachedAccount).toEqual({
				id: "api-account",
				name: "API Account",
			});
		});
	});
});
