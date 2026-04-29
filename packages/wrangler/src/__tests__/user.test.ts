import {
	COMPLIANCE_REGION_CONFIG_UNKNOWN,
	getGlobalWranglerConfigPath,
} from "@cloudflare/workers-utils";
import {
	normalizeString,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import * as Sentry from "@sentry/node";
import ci from "ci-info";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it, vi } from "vitest";
import { saveToConfigCache } from "../config-cache";
import { allMetricsDispatchesCompleted } from "../metrics";
import { getMetricsConfig } from "../metrics/metrics-config";
import openInBrowser from "../open-in-browser";
import {
	fetchAllAccounts,
	getAccountFromCache,
	getActiveAccountId,
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
import { MockWebSocket } from "./helpers/mock-websocket";
import {
	createFetchResult,
	msw,
	mswSuccessOauthHandlers,
	mswSuccessUserHandlers,
} from "./helpers/msw";
import { getMswSuccessMembershipHandlers } from "./helpers/msw/handlers/user";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { UserAuthConfig } from "../user";
import type { Config } from "@cloudflare/workers-utils";
import type { Mock } from "vitest";

// Stubbed WebSocket so the OAuth WebSocket relay flow can be tested without a
// real network connection. Tests drive instances by calling `triggerOpen` /
// `triggerMessage` etc. on `MockWebSocket.last`. Scoped to this file rather
// than `vitest.setup.ts` so other tests (e.g. inspector debugging) keep using
// the real `ws` package.
//
// `MockWebSocket` is loaded with a dynamic import inside the factory: vitest
// hoists `vi.mock` above all top-level imports, so a direct reference to the
// imported `MockWebSocket` would hit a TDZ ReferenceError when `ws` is first
// required (the static import binding is not yet initialised).
vi.mock("ws", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	const original = await importOriginal<typeof import("ws")>();
	const mockModule = await import("./helpers/mock-websocket");
	return {
		...original,
		__esModule: true,
		default: mockModule.MockWebSocket,
	};
});

// Reset the mock WebSocket instance list between tests so each test sees only
// the instances created during its own execution.
beforeEach(() => {
	MockWebSocket.reset();
});

describe("User", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	// TODO: Implement these two mocks with MSW
	const { mockOAuthServerCallback, mockOAuthRelayCallback } = mockOAuthFlow();
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
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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
				Note that the OAuth login page will always redirect to \`localhost:8976\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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
				Note that the OAuth login page will always redirect to \`localhost:8976\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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
				Note that the OAuth login page will always redirect to \`localhost:8976\`.
				If you have changed the callback host or port because you are running in a container, then ensure that you have port forwarding set up correctly.
				Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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
				Opening a link in your default browser: https://dash.staging.cloudflare.com/oauth2/auth?response_type=code&client_id=4b2ea6cc-9421-4761-874b-ce550e0e3def&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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

		describe("with --experimental-websocket-callback (auth relay)", () => {
			it("should login a user via the WebSocket auth relay", async ({
				expect,
			}) => {
				mockOAuthRelayCallback("success");

				let counter = 0;
				msw.use(
					http.post(
						"*/oauth2/token",
						async ({ request }) => {
							counter += 1;
							const body = await request.text();
							const params = new URLSearchParams(body);
							// The redirect_uri sent to the token endpoint must be the
							// auth relay's callback URL, not localhost.
							expect(params.get("redirect_uri")).toBe(
								"https://auth.devprod.cloudflare.dev/callback"
							);
							expect(params.get("code")).toBe("test-oauth-code");
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

				await runWrangler("login --experimental-websocket-callback");

				expect(counter).toBe(1);
				expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
					api_token: undefined,
					oauth_token: "test-access-token",
					refresh_token: "test-refresh-token",
					expiration_time: expect.any(String),
					scopes: ["account:read"],
				});
			});

			it("should accept the --x-websocket-callback alias", async ({
				expect,
			}) => {
				mockOAuthRelayCallback("success");
				msw.use(
					http.post(
						"*/oauth2/token",
						() =>
							HttpResponse.json({
								access_token: "test-access-token",
								expires_in: 100000,
								refresh_token: "test-refresh-token",
								scope: "account:read",
							}),
						{ once: true }
					)
				);

				await runWrangler("login --x-websocket-callback");

				expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
					api_token: undefined,
					oauth_token: "test-access-token",
					refresh_token: "test-refresh-token",
					expiration_time: expect.any(String),
					scopes: ["account:read"],
				});
			});

			it("should error when the user denies consent in the WebSocket flow", async ({
				expect,
			}) => {
				mockOAuthRelayCallback("failure");

				await expect(
					runWrangler("login --experimental-websocket-callback")
				).rejects.toThrow(/Consent denied/);
			});

			it("should use the auth worker URL as redirect_uri in the auth URL", async ({
				expect,
			}) => {
				mockOAuthRelayCallback("success");
				msw.use(
					http.post(
						"*/oauth2/token",
						() =>
							HttpResponse.json({
								access_token: "test-access-token",
								expires_in: 100000,
								refresh_token: "test-refresh-token",
								scope: "account:read",
							}),
						{ once: true }
					)
				);

				await runWrangler("login --experimental-websocket-callback");

				// The auth URL printed in the console should contain the auth
				// worker callback URL as redirect_uri (not localhost).
				expect(std.out).toContain(
					encodeURIComponent("https://auth.devprod.cloudflare.dev/callback")
				);
				expect(std.out).not.toContain(
					encodeURIComponent("http://localhost:8976/oauth/callback")
				);
			});

			it("should clean up WebSocket listeners on early failure (no orphan rejection)", async ({
				expect,
			}) => {
				// Reproduces the listener-cleanup bug without relying on the
				// real 120s timeout. We make `openInBrowser` throw *after* the
				// WebSocket message/close listeners have been attached. If
				// `getOauthTokenViaWebSocket` skips its listener cleanup on the
				// throw path, the outer `ws.close()` will fire `onClose`,
				// which rejects the now-orphaned `messagePromise` and
				// surfaces as an unhandled rejection.
				(openInBrowser as Mock).mockImplementation(async () => {
					throw new Error("simulated browser launch failure");
				});

				const unhandled: unknown[] = [];
				const onUnhandled = (reason: unknown) => unhandled.push(reason);
				process.on("unhandledRejection", onUnhandled);

				try {
					await expect(
						runWrangler("login --experimental-websocket-callback")
					).rejects.toThrow(/simulated browser launch failure/);

					// Give microtasks a tick to flush any orphan rejection
					// that the WebSocket close event might have produced.
					await new Promise((r) => setImmediate(r));

					expect(unhandled).toEqual([]);
				} finally {
					process.off("unhandledRejection", onUnhandled);
				}
			});

			describe("metrics and error reporting", () => {
				beforeEach(() => {
					// The metrics dispatcher only POSTs events when
					// SPARROW_SOURCE_KEY is set (it's normally injected at
					// build time) AND `getMetricsConfig().enabled` is true.
					// vitest.setup.ts globally stubs the latter to `false`
					// so most tests don't accidentally send events; for these
					// tests we explicitly opt back in so we can observe the
					// dispatched events.
					vi.stubEnv("SPARROW_SOURCE_KEY", "MOCK_KEY");
					vi.mocked(getMetricsConfig).mockReturnValue({
						enabled: true,
						deviceId: "mock-device",
					});
				});

				it("emits a `(relay attempt)` metrics event for every relay login", async ({
					expect,
				}) => {
					const events = captureMetricEvents();
					mockOAuthRelayCallback("success");
					msw.use(
						http.post(
							"*/oauth2/token",
							() =>
								HttpResponse.json({
									access_token: "test-access-token",
									expires_in: 100000,
									refresh_token: "test-refresh-token",
									scope: "account:read",
								}),
							{ once: true }
						)
					);

					await runWrangler("login --experimental-websocket-callback");
					await allMetricsDispatchesCompleted();

					const attempt = events.find(
						(e) => e.event === "login user (relay attempt)"
					);
					expect(attempt).toBeDefined();
					expect(attempt?.properties.authWorkerUrl).toBe(
						"https://auth.devprod.cloudflare.dev"
					);
					expect(
						events.find((e) => e.event === "login user (relay fallback)")
					).toBeUndefined();
				});

				it("emits `(relay fallback)` and reports to Sentry when falling back", async ({
					expect,
				}) => {
					const events = captureMetricEvents();
					const captureException = vi
						.spyOn(Sentry, "captureException")
						.mockImplementation(() => "");
					mockOAuthServerCallback("success");
					MockWebSocket.autoOpen = false;

					const runPromise = runWrangler(
						"login --experimental-websocket-callback"
					);
					const ws = await waitForMockWebSocket();
					ws.triggerError("ECONNREFUSED");
					await runPromise;
					await allMetricsDispatchesCompleted();

					const fallback = events.find(
						(e) => e.event === "login user (relay fallback)"
					);
					expect(fallback).toBeDefined();
					expect(fallback?.properties.authWorkerUrl).toBe(
						"https://auth.devprod.cloudflare.dev"
					);
					expect(fallback?.properties.reason).toBe("ECONNREFUSED");

					expect(captureException).toHaveBeenCalledTimes(1);
					const [err, ctx] = captureException.mock.calls[0];
					expect((err as Error).message).toContain("ECONNREFUSED");
					expect(ctx).toMatchObject({
						level: "warning",
						tags: { feature: "wrangler-login-relay" },
						extra: expect.objectContaining({ detail: "ECONNREFUSED" }),
					});
				});

				it("does not emit relay events for the local-only login flow", async ({
					expect,
				}) => {
					const events = captureMetricEvents();
					mockOAuthServerCallback("success");
					msw.use(
						http.post(
							"*/oauth2/token",
							() =>
								HttpResponse.json({
									access_token: "test-access-token",
									expires_in: 100000,
									refresh_token: "test-refresh-token",
									scope: "account:read",
								}),
							{ once: true }
						)
					);

					await runWrangler("login");
					await allMetricsDispatchesCompleted();

					expect(
						events.find((e) => e.event === "login user (relay attempt)")
					).toBeUndefined();
					expect(
						events.find((e) => e.event === "login user (relay fallback)")
					).toBeUndefined();
				});

				it("does not emit `(relay fallback)` for failures after the browser is opened", async ({
					expect,
				}) => {
					const events = captureMetricEvents();
					const captureException = vi
						.spyOn(Sentry, "captureException")
						.mockImplementation(() => "");
					(openInBrowser as Mock).mockImplementation(async () => {
						MockWebSocket.last?.triggerClose();
					});

					await expect(
						runWrangler("login --experimental-websocket-callback")
					).rejects.toThrow();
					await allMetricsDispatchesCompleted();

					expect(
						events.find((e) => e.event === "login user (relay attempt)")
					).toBeDefined();
					expect(
						events.find((e) => e.event === "login user (relay fallback)")
					).toBeUndefined();
					expect(captureException).not.toHaveBeenCalled();
				});
			});

			describe("automatic fallback to the local callback server", () => {
				/**
				 * Helper: kick off `runWrangler` with the WebSocket relay flag,
				 * wait until the WebSocket has been constructed, then run the
				 * supplied driver to simulate a relay failure. Polls
				 * `MockWebSocket.last` (rather than waiting a fixed number of
				 * `setImmediate` ticks) so the helper stays robust to small
				 * timing changes in the upstream login flow.
				 */
				async function runAndFailWebSocket(
					cmd: string,
					driver: (ws: MockWebSocket) => void
				) {
					MockWebSocket.autoOpen = false;
					const runPromise = runWrangler(cmd);
					const ws = await waitForMockWebSocket();
					driver(ws);
					return runPromise;
				}

				it("falls back to the local server when the relay connection errors before open", async ({
					expect,
				}) => {
					mockOAuthServerCallback("success");

					await runAndFailWebSocket(
						"login --experimental-websocket-callback",
						(ws) => ws.triggerError("ECONNREFUSED")
					);

					expect(std.warn).toContain("Could not reach the auth relay");
					expect(std.warn).toContain("ECONNREFUSED");
					// The failed relay socket must be terminated (readyState
					// 3 === CLOSED) and not leaked in CONNECTING state —
					// asserts `ws.terminate()` ran in the outer `finally`
					// after the connect promise rejected.
					expect(MockWebSocket.last?.readyState).toBe(3);
					expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
						api_token: undefined,
						oauth_token: "test-access-token",
						refresh_token: "test-refresh-token",
						expiration_time: expect.any(String),
						scopes: ["account:read"],
					});
				});

				it("falls back when the relay closes before open", async ({
					expect,
				}) => {
					mockOAuthServerCallback("success");

					await runAndFailWebSocket(
						"login --experimental-websocket-callback",
						(ws) => ws.triggerClose()
					);

					expect(std.warn).toContain("Could not reach the auth relay");
					expect(std.warn).toContain("connection closed before open");
					expect(MockWebSocket.last?.readyState).toBe(3);
					expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
						api_token: undefined,
						oauth_token: "test-access-token",
						refresh_token: "test-refresh-token",
						expiration_time: expect.any(String),
						scopes: ["account:read"],
					});
				});

				it("falls back when the relay connect times out", async ({
					expect,
				}) => {
					// Use a very short timeout so the test doesn't sleep noticeably.
					vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "50");
					mockOAuthServerCallback("success");
					MockWebSocket.autoOpen = false;

					await runWrangler("login --experimental-websocket-callback");

					expect(std.warn).toContain("Could not reach the auth relay");
					expect(std.warn).toContain("connect timed out after 50ms");
					expect(MockWebSocket.last?.readyState).toBe(3);
					expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
						api_token: undefined,
						oauth_token: "test-access-token",
						refresh_token: "test-refresh-token",
						expiration_time: expect.any(String),
						scopes: ["account:read"],
					});
				});

				it("does not fall back when WRANGLER_AUTH_WORKER_TIMEOUT=0", async ({
					expect,
				}) => {
					vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "0");

					await expect(
						runAndFailWebSocket(
							"login --experimental-websocket-callback",
							(ws) => ws.triggerError("ECONNREFUSED")
						)
					).rejects.toThrow(/Auth relay is unavailable: ECONNREFUSED/);

					// No localhost fallback was attempted.
					expect(std.warn).not.toContain("Falling back");
				});

				it("treats empty WRANGLER_AUTH_WORKER_TIMEOUT as the default (still falls back)", async ({
					expect,
				}) => {
					// `Number("") === 0` would otherwise activate the special
					// "no timeout, no fallback" semantics. An empty value
					// (e.g. set via `WRANGLER_AUTH_WORKER_TIMEOUT=` or a
					// misconfigured `.env`) must keep the default 5s timeout
					// and fallback behaviour.
					vi.stubEnv("WRANGLER_AUTH_WORKER_TIMEOUT", "");
					mockOAuthServerCallback("success");

					await runAndFailWebSocket(
						"login --experimental-websocket-callback",
						(ws) => ws.triggerError("ECONNREFUSED")
					);

					expect(std.warn).toContain("Could not reach the auth relay");
					expect(readAuthConfigFile()).toEqual<UserAuthConfig>({
						api_token: undefined,
						oauth_token: "test-access-token",
						refresh_token: "test-refresh-token",
						expiration_time: expect.any(String),
						scopes: ["account:read"],
					});
				});

				it("does not fall back once the browser has been opened", async ({
					expect,
				}) => {
					// `openInBrowser` is replaced with one that closes the
					// WebSocket *after* the browser has been opened. This
					// simulates the relay disappearing mid-flow. The fix
					// must keep the existing UserError path here — falling
					// back at this point would require re-authorising at a
					// different redirect_uri.
					(openInBrowser as Mock).mockImplementation(async () => {
						MockWebSocket.last?.triggerClose();
					});

					await expect(
						runWrangler("login --experimental-websocket-callback")
					).rejects.toThrow(
						/Auth relay connection closed before login completed/
					);

					// No fallback warning was logged.
					expect(std.warn).not.toContain("Falling back");
				});
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
		).resolves.toEqual(false);
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
		).resolves.toEqual(false);
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
			Opening a link in your default browser: https://dash.cloudflare.com/oauth2/auth?response_type=code&client_id=54d11594-84e4-41aa-b438-e81b8fa78ee7&redirect_uri=http%3A%2F%2Flocalhost%3A8976%2Foauth%2Fcallback&scope=account%3Aread%20user%3Aread%20workers%3Awrite%20workers_kv%3Awrite%20workers_routes%3Awrite%20workers_scripts%3Awrite%20workers_tail%3Aread%20d1%3Awrite%20pages%3Awrite%20zone%3Aread%20ssl_certs%3Awrite%20ai%3Awrite%20ai-search%3Awrite%20ai-search%3Arun%20queues%3Awrite%20pipelines%3Awrite%20secrets_store%3Awrite%20artifacts%3Awrite%20flagship%3Awrite%20containers%3Awrite%20cloudchamber%3Awrite%20connectivity%3Aadmin%20email_routing%3Awrite%20email_sending%3Awrite%20browser%3Awrite%20offline_access&state=MOCK_STATE_PARAM&code_challenge=MOCK_CODE_CHALLENGE&code_challenge_method=S256
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

		it("should fall back to /accounts when /memberships returns 9109 (Account API Token path)", async ({
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
							errors: [{ code: 9109, message: "Insufficient permissions" }],
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

		it("should throw a helpful error on 9109 when /accounts is also unusable", async ({
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
							errors: [{ code: 9109, message: "Insufficient permissions" }],
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

		it("should propagate /memberships errors that are not 9109 or 10000", async ({
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

/**
 * Wait for `MockWebSocket.last` to be populated, polling `setImmediate` for up
 * to ~50 ticks (~500ms in the worst case) before giving up. Used by tests
 * that need the relay WebSocket to have been constructed before they drive
 * it. Polling (rather than awaiting a fixed number of ticks) keeps the
 * helper resilient to small timing changes in the login flow.
 */
async function waitForMockWebSocket(): Promise<MockWebSocket> {
	for (let i = 0; i < 50; i++) {
		const ws = MockWebSocket.last;
		if (ws) {
			return ws;
		}
		await new Promise((r) => setImmediate(r));
	}
	throw new Error("waitForMockWebSocket: no MockWebSocket was constructed");
}

/**
 * Capture all metrics events posted via the Sparrow `/event` endpoint and
 * return them as a live-updating array. Lets tests assert which named events
 * were dispatched (and with what properties) without mocking the metrics
 * module itself.
 */
function captureMetricEvents() {
	const events: Array<{ event: string; properties: Record<string, unknown> }> =
		[];
	msw.use(
		http.post(`*/event`, async ({ request }) => {
			const body = (await request.json()) as {
				event: string;
				properties: Record<string, unknown>;
			};
			events.push({ event: body.event, properties: body.properties });
			return HttpResponse.json({}, { status: 200 });
		})
	);
	return events;
}
