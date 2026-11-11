import childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	it,
	vi,
} from "vitest";
import { clearAccessCaches } from "../src/access";
import * as callbackServer from "../src/callback-server";
import { ProcessOwnerChecker } from "../src/core/process-owner";
import { EncryptedFileCredentialStore } from "../src/credential-store/encrypted-file-store";
import { FileCredentialStore } from "../src/credential-store/file-store";
import { setKeyProviderFactoryForTesting } from "../src/credential-store/key-providers/factory";
import { createCredentialStorageContext } from "../src/credential-store/resolver";
import { createOAuthFlow } from "../src/flow";
import type {
	AuthConfigStorage,
	UserAuthConfig,
} from "../src/config-file/auth";
import type { OAuthFlowContext } from "../src/context";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	syncBuiltinESMExports();
	msw.restoreHandlers();
	msw.resetHandlers();
});
afterAll(() => msw.close());

const COMPLIANCE_CONFIG: ComplianceConfig = { compliance_region: undefined };

const PAST_DATE = new Date(Date.now() - 100_000_000).toISOString();
const FUTURE_DATE = new Date(Date.now() + 100_000_000).toISOString();

/**
 * Create a test context wired to an in-memory storage backend.
 *
 * @returns The context, the logs array, and a handle to the storage so
 *   tests can manipulate the "on-disk" state between calls.
 */
function createTestContext(): {
	ctx: OAuthFlowContext;
	logs: { level: string; message: string }[];
	storage: AuthConfigStorage;
} {
	const logs: { level: string; message: string }[] = [];
	let stored: UserAuthConfig | undefined;
	const storagePath = path.join(
		os.tmpdir(),
		`workers-auth-test-${randomUUID()}`
	);

	const storage: AuthConfigStorage = {
		read: () => stored,
		write: (config: UserAuthConfig) => {
			stored = config;
		},
		clear: () => {
			const existed = stored !== undefined;
			stored = undefined;
			return existed;
		},
		path: () => storagePath,
	};

	const logger: OAuthFlowContext["logger"] = {
		debug: (...args: unknown[]) => {
			logs.push({ level: "debug", message: args.join(" ") });
		},
		info: (...args: unknown[]) => {
			logs.push({ level: "info", message: args.join(" ") });
		},
		log: (...args: unknown[]) => {
			logs.push({ level: "log", message: args.join(" ") });
		},
		warn: (...args: unknown[]) => {
			logs.push({ level: "warn", message: args.join(" ") });
		},
		error: (...args: unknown[]) => {
			logs.push({ level: "error", message: args.join(" ") });
		},
	};

	return {
		logs,
		storage,
		ctx: {
			logger,
			isNonInteractiveOrCI: () => true,
			openInBrowser: async () => {},
			hasEnvCredentials: () => false,
			clientId: "test-client-id",
			consent: {
				granted: { url: "https://example.com/granted" },
				denied: {
					url: "https://example.com/denied",
					error: "consent denied",
				},
			},
			cliDisplayName: "TestCLI",
			deviceLoginCommand: "testcli auth login --device",
			redirectUri: "http://localhost:9999/oauth/callback",
			storageFactory: () => storage,
			allowGlobalAuthKey: true,
			temporary: undefined,
		},
	};
}

/** Handle the Cloudflare Access probe. */
function mockAccessProbe() {
	return http.get(
		"https://dash.cloudflare.com/",
		() => new HttpResponse(null, { status: 200 })
	);
}

/**
 * Return an MSW handler that always succeeds for the token endpoint.
 *
 * @param overrides - Optional overrides for the response body.
 * @returns An MSW handler for `POST *​/oauth2/token`.
 */
function mockTokenSuccess(overrides: Record<string, unknown> = {}) {
	return http.post("*/oauth2/token", () =>
		HttpResponse.json({
			access_token: "fresh-access-token",
			expires_in: 3600,
			refresh_token: "RT_NEXT",
			scope: "account:read",
			token_type: "bearer",
			...overrides,
		})
	);
}

describe.each(["toml", "json"] as const)(
	"logout without a refresh token (%s)",
	(format) => {
		runInTempDir();

		it.for([
			{
				name: "access-token-only",
				credentials: {
					oauth_token: "access-token",
					expiration_time: FUTURE_DATE,
				},
			},
			{
				name: "empty-refresh-token",
				credentials: {
					oauth_token: "access-token",
					refresh_token: "",
					expiration_time: FUTURE_DATE,
				},
			},
			{
				name: "legacy-api-token",
				credentials: { api_token: "legacy-api-token" },
			},
		])(
			"clears $name credentials without revocation and invalidates cached auth",
			async ({ credentials }, { expect }) => {
				const { ctx, logs } = createTestContext();
				const storage = new FileCredentialStore(
					process.cwd(),
					undefined,
					format
				);
				storage.write(credentials);
				ctx.storageFactory = () => storage;
				ctx.purgeOnLoginOrLogout = vi.fn();
				const revoke = vi.fn(() => new HttpResponse(null));
				msw.use(http.post("*/oauth2/revoke", revoke));

				await createOAuthFlow(ctx).logout();

				expect(existsSync(storage.path())).toBe(false);
				expect(storage.read()).toBeUndefined();
				expect(revoke).not.toHaveBeenCalled();
				expect(logs.filter(({ level }) => level === "log")).toEqual([
					{ level: "log", message: "Cleared stored credentials." },
				]);
				expect(ctx.purgeOnLoginOrLogout).toHaveBeenCalledOnce();
			}
		);

		it("keeps the not-logged-in message when no credentials exist", async ({
			expect,
		}) => {
			const { ctx, logs } = createTestContext();
			const storage = new FileCredentialStore(process.cwd(), undefined, format);
			ctx.storageFactory = () => storage;
			ctx.purgeOnLoginOrLogout = vi.fn();
			const revoke = vi.fn(() => new HttpResponse(null));
			msw.use(http.post("*/oauth2/revoke", revoke));

			await createOAuthFlow(ctx).logout();

			expect(existsSync(storage.path())).toBe(false);
			expect(revoke).not.toHaveBeenCalled();
			expect(logs).toEqual([
				{ level: "log", message: "Not logged in, exiting..." },
			]);
			expect(ctx.purgeOnLoginOrLogout).not.toHaveBeenCalled();
		});
	}
);

describe.each([false, true])(
	"process-identity reuse (keyring: %s)",
	(keyring) => {
		runInTempDir();

		afterEach(() => setKeyProviderFactoryForTesting(undefined));

		it.for([false, true])(
			"probes its process identity once across repeated refreshes, writes and logout (resolver: %s)",
			async (resolver, { expect }) => {
				const { ctx } = createTestContext();
				const provider = {
					getKey: () => new Uint8Array(32),
					setKey: () => {},
					deleteKey: () => {},
					describe: () => "test key",
				};
				setKeyProviderFactoryForTesting(() => provider);
				const bundle = createCredentialStorageContext({
					serviceName: "test",
					getConfigPath: () => process.cwd(),
					isKeyringEnabled: () => keyring,
					logger: ctx.logger,
					isNonInteractiveOrCI: () => true,
				});
				const storage = keyring
					? new EncryptedFileCredentialStore(process.cwd(), provider)
					: new FileCredentialStore(process.cwd());
				ctx.storageFactory = resolver ? bundle.storageFactory : () => storage;
				storage.write({
					oauth_token: "expired-access",
					refresh_token: "RT_A",
					expiration_time: PAST_DATE,
				});
				const reads = vi.spyOn(fs, "readFileSync");
				const commands = vi.spyOn(childProcess, "execFileSync");
				syncBuiltinESMExports();
				function identityProbeCount(): number {
					return process.platform === "linux"
						? reads.mock.calls.filter(
								([file]) => String(file) === `/proc/${process.pid}/stat`
							).length
						: commands.mock.calls.filter(
								([command]) =>
									command === "/bin/ps" || command === "powershell.exe"
							).length;
				}
				const flow = createOAuthFlow(ctx);
				expect(identityProbeCount()).toBe(0);
				const createOwner = vi.spyOn(
					ProcessOwnerChecker.prototype,
					"createOwner"
				);
				msw.use(
					mockAccessProbe(),
					mockTokenSuccess({ expires_in: -1 }),
					http.post("*/oauth2/revoke", () => new HttpResponse(null))
				);

				expect(
					await flow.loginOrRefreshIfRequired({
						complianceConfig: COMPLIANCE_CONFIG,
						scopes: [],
					})
				).toEqual({ loggedIn: true });
				expect(
					await flow.loginOrRefreshIfRequired({
						complianceConfig: COMPLIANCE_CONFIG,
						scopes: [],
					})
				).toEqual({ loggedIn: true });
				await flow.logout();

				expect(createOwner).toHaveBeenCalledTimes(5);
				expect(new Set(createOwner.mock.contexts).size).toBe(1);
				expect(identityProbeCount()).toBe(1);
				expect(storage.read()).toBeUndefined();
			}
		);
	}
);

describe("refreshToken (via loginOrRefreshIfRequired)", () => {
	beforeEach(() => {
		clearAccessCaches();
	});

	it.for([false, true])(
		"refreshes different backends of one profile independently across separate flows: %s",
		async (separateFlows, { expect }) => {
			const plaintext = createTestContext();
			const encrypted = createTestContext();
			const profilePath = plaintext.storage.path();
			vi.spyOn(plaintext.storage, "path").mockReturnValue(
				`${profilePath}.toml`
			);
			vi.spyOn(encrypted.storage, "path").mockReturnValue(`${profilePath}.enc`);
			for (const { storage } of [plaintext, encrypted]) {
				storage.write({
					oauth_token: "expired-access",
					refresh_token: "RT_A",
					expiration_time: PAST_DATE,
				});
			}
			const exchange = vi.fn(() =>
				HttpResponse.json({
					access_token: "fresh-access-token",
					refresh_token: "RT_NEXT",
					expires_in: 3600,
					scope: "account:read",
				})
			);
			msw.use(mockAccessProbe(), http.post("*/oauth2/token", exchange));
			let activeStorage = plaintext.storage;
			plaintext.ctx.storageFactory = () => activeStorage;
			const flow = createOAuthFlow(plaintext.ctx);
			const first = flow.getOAuthTokenFromLocalState();
			activeStorage = encrypted.storage;
			const secondFlow = separateFlows ? createOAuthFlow(encrypted.ctx) : flow;
			const second = secondFlow.getOAuthTokenFromLocalState();
			expect(await Promise.all([first, second])).toEqual([
				"fresh-access-token",
				"fresh-access-token",
			]);
			expect(plaintext.storage.read()?.oauth_token).toBe("fresh-access-token");
			expect(encrypted.storage.read()?.oauth_token).toBe("fresh-access-token");
			expect(exchange).toHaveBeenCalledTimes(2);
		}
	);

	it("pins the selected backend until a refresh commits", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		const other = createTestContext().storage;
		let active = storage;
		ctx.storageFactory = () => ({
			read: () => active.read(),
			write: (value) => active.write(value),
			clear: () => active.clear(),
			path: () => active.path(),
			getForTransaction: () => active,
		});
		storage.write({
			oauth_token: "expired",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
		});
		other.write({
			oauth_token: "other",
			refresh_token: "OTHER",
			expiration_time: FUTURE_DATE,
		});
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", () => {
				active = other;
				return HttpResponse.json({
					access_token: "fresh",
					refresh_token: "RT_B",
					expires_in: 3600,
					scope: "account:read",
				});
			})
		);
		expect(
			await createOAuthFlow(ctx).loginOrRefreshIfRequired({
				complianceConfig: COMPLIANCE_CONFIG,
				scopes: [],
			})
		).toEqual({ loggedIn: true });
		expect(storage.read()?.refresh_token).toBe("RT_B");
		expect(other.read()?.refresh_token).toBe("OTHER");
	});

	it("does not let a delayed refresh overwrite a new login", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
		});
		let finishRefresh = () => {};
		let received = false;
		const responseReady = new Promise<void>((resolve) => {
			finishRefresh = resolve;
		});
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				received = true;
				await responseReady;
				return HttpResponse.json({
					access_token: "refreshed",
					refresh_token: "RT_B",
					expires_in: 3600,
					scope: "account:read",
				});
			})
		);
		const flow = createOAuthFlow(ctx);
		const refresh = flow.getOAuthTokenFromLocalState();
		await vi.waitFor(() => expect(received).toBe(true));
		vi.spyOn(callbackServer, "getOauthToken").mockResolvedValue({
			token: { value: "new-login", expiry: FUTURE_DATE },
			refreshToken: { value: "NEW_LOGIN" },
		});
		const login = flow.login({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: [],
		});
		await vi.waitFor(() =>
			expect(callbackServer.getOauthToken).toHaveBeenCalled()
		);
		expect(storage.read()?.refresh_token).toBe("RT_A");
		finishRefresh();
		await refresh;
		expect(await login).toBe(true);
		expect(storage.read()?.refresh_token).toBe("NEW_LOGIN");
	});

	it("does not exchange or recreate credentials after a pending logout", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
		});
		let finishLogout = () => {};
		let revoking = false;
		let exchangeCount = 0;
		const responseReady = new Promise<void>((resolve) => {
			finishLogout = resolve;
		});
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", () => {
				exchangeCount++;
				return HttpResponse.json({
					access_token: "must-not-be-written",
					refresh_token: "must-not-be-written",
					expires_in: 3600,
					scope: "account:read",
				});
			}),
			http.post("*/oauth2/revoke", async () => {
				revoking = true;
				await responseReady;
				return new HttpResponse(null);
			})
		);
		const flow = createOAuthFlow(ctx);
		const logout = flow.logout();
		await vi.waitFor(() => expect(revoking).toBe(true));
		const refresh = flow.getOAuthTokenFromLocalState();
		finishLogout();
		await logout;
		expect(await refresh).toBeUndefined();
		expect(exchangeCount).toBe(0);
		expect(storage.read()).toBeUndefined();
	});

	it("refreshes an expired token and persists the result", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		msw.use(mockAccessProbe(), mockTokenSuccess());

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		const written = storage.read();
		expect(written?.oauth_token).toBe("fresh-access-token");
		expect(written?.refresh_token).toBe("RT_NEXT");
	});

	it("releases the lock when logout revocation times out", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
		});
		const controller = new AbortController();
		vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
		let revoking = false;
		msw.use(
			mockAccessProbe(),
			mockTokenSuccess(),
			http.post("*/oauth2/revoke", async ({ request }) => {
				revoking = true;
				await new Promise<void>((resolve) =>
					request.signal.addEventListener("abort", () => resolve(), {
						once: true,
					})
				);
				return new HttpResponse(null);
			})
		);
		const flow = createOAuthFlow(ctx);
		const logout = flow.logout();
		const rejected = expect(logout).rejects.toThrow("revoke timed out");
		await vi.waitFor(() => expect(revoking).toBe(true));
		expect(AbortSignal.timeout).toHaveBeenCalledWith(30_000);
		controller.abort(new Error("revoke timed out"));
		await rejected;
		vi.restoreAllMocks();
		expect(await flow.getOAuthTokenFromLocalState()).toBe("fresh-access-token");
	});

	it("skips the exchange when the token is already fresh after lock acquisition", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		// Token is not expired — no exchange should happen.
		storage.write({
			oauth_token: "still-valid",
			refresh_token: "RT_A",
			expiration_time: FUTURE_DATE,
			scopes: ["account:read"],
		});

		// No MSW handler for token endpoint — if an exchange is attempted,
		// the test will fail with "unhandled request".
		msw.use(mockAccessProbe());

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
	});

	it("retries on invalid_grant when a sibling rotated the refresh token", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		let callCount = 0;
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async ({ request }) => {
				callCount++;
				const body = new URLSearchParams(await request.text());
				const rt = body.get("refresh_token");

				if (rt === "RT_A") {
					// Simulate the first exchange failing because a sibling
					// already consumed RT_A. Before the retry, we also update
					// the "disk" to simulate the sibling's write.
					storage.write({
						oauth_token: "expired-access",
						refresh_token: "RT_B",
						expiration_time: PAST_DATE,
						scopes: ["account:read"],
					});
					return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
				}
				// RT_B succeeds.
				return HttpResponse.json({
					access_token: "fresh-from-retry",
					expires_in: 3600,
					refresh_token: "RT_C",
					scope: "account:read",
					token_type: "bearer",
				});
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		expect(callCount).toBe(2);
		const written = storage.read();
		expect(written?.oauth_token).toBe("fresh-from-retry");
		expect(written?.refresh_token).toBe("RT_C");
	});

	it("succeeds without retry when a sibling already completed the refresh", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		let callCount = 0;
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				callCount++;
				// Before returning the error, simulate the sibling having
				// completed a full refresh (fresh access token on disk).
				storage.write({
					oauth_token: "sibling-refreshed-token",
					refresh_token: "RT_B",
					expiration_time: FUTURE_DATE,
					scopes: ["account:read"],
				});
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		// Only one call — no retry needed because the sibling already
		// wrote a fresh access token.
		expect(callCount).toBe(1);
	});

	it("gives up when invalid_grant and the on-disk token hasn't changed", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		// Non-interactive, so it can't fall back to login.
		expect(result).toEqual({
			loggedIn: false,
			reason: "token-expired-non-interactive",
		});
	});

	it("logs refresh failures at warn level", async ({ expect }) => {
		const { ctx, storage, logs } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		const warnLogs = logs.filter((l) => l.level === "warn");
		expect(
			warnLogs.some((l) => l.message.includes("Token refresh failed"))
		).toBe(true);
		expect(warnLogs.some((l) => l.message.includes("invalid_grant"))).toBe(
			true
		);
	});

	it("logs at warn when retry also fails", async ({ expect }) => {
		const { ctx, storage, logs } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		let callCount = 0;
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async () => {
				callCount++;
				if (callCount === 1) {
					// First call fails; simulate sibling writing a different RT.
					storage.write({
						oauth_token: "expired-access",
						refresh_token: "RT_B",
						expiration_time: PAST_DATE,
						scopes: ["account:read"],
					});
				}
				// Both calls fail with invalid_grant.
				return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
			})
		);

		const flow = createOAuthFlow(ctx);
		await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(callCount).toBe(2);
		const warnLogs = logs.filter((l) => l.level === "warn");
		expect(
			warnLogs.some((l) => l.message.includes("Token refresh retry failed"))
		).toBe(true);
		expect(warnLogs.some((l) => l.message.includes("invalid_grant"))).toBe(
			true
		);
	});

	it("sends the post-lock snapshot token, not a re-read from disk", async ({
		expect,
	}) => {
		const { ctx, storage } = createTestContext();
		storage.write({
			oauth_token: "expired-access",
			refresh_token: "RT_A",
			expiration_time: PAST_DATE,
			scopes: ["account:read"],
		});

		const sentTokens: string[] = [];
		msw.use(
			mockAccessProbe(),
			http.post("*/oauth2/token", async ({ request }) => {
				const body = new URLSearchParams(await request.text());
				const rt = body.get("refresh_token") ?? "";
				sentTokens.push(rt);

				// Simulate a sibling writing RT_B to disk between the post-lock
				// read and the exchange. Without the fix, the exchange would
				// re-read disk and send RT_B; with the fix it sends RT_A.
				storage.write({
					oauth_token: "expired-access",
					refresh_token: "RT_B",
					expiration_time: PAST_DATE,
					scopes: ["account:read"],
				});

				return HttpResponse.json({
					access_token: "fresh-access-token",
					expires_in: 3600,
					refresh_token: "RT_NEXT",
					scope: "account:read",
					token_type: "bearer",
				});
			})
		);

		const flow = createOAuthFlow(ctx);
		const result = await flow.loginOrRefreshIfRequired({
			complianceConfig: COMPLIANCE_CONFIG,
			scopes: ["account:read"],
		});

		expect(result).toEqual({ loggedIn: true });
		// The exchange should have used RT_A (the post-lock snapshot), not
		// RT_B (the value a sibling wrote to disk mid-exchange).
		expect(sentTokens).toEqual(["RT_A"]);
	});

	it.for([false, true])(
		"deduplicates concurrent refreshes across separate flows: %s",
		async (separateFlows, { expect }) => {
			const { ctx, storage } = createTestContext();
			storage.write({
				oauth_token: "expired-access",
				refresh_token: "RT_A",
				expiration_time: PAST_DATE,
				scopes: ["account:read"],
			});

			let callCount = 0;
			msw.use(
				mockAccessProbe(),
				http.post("*/oauth2/token", async () => {
					callCount++;
					return HttpResponse.json({
						access_token: "fresh-access-token",
						expires_in: 3600,
						refresh_token: "RT_NEXT",
						scope: "account:read",
						token_type: "bearer",
					});
				})
			);

			const flow = createOAuthFlow(ctx);
			const secondFlow = separateFlows ? createOAuthFlow(ctx) : flow;
			const [r1, r2] = await Promise.all([
				secondFlow.loginOrRefreshIfRequired({
					complianceConfig: COMPLIANCE_CONFIG,
					scopes: ["account:read"],
				}),
				flow.loginOrRefreshIfRequired({
					complianceConfig: COMPLIANCE_CONFIG,
					scopes: ["account:read"],
				}),
			]);

			expect(r1).toEqual({ loggedIn: true });
			expect(r2).toEqual({ loggedIn: true });
			// Only one token exchange should have been made.
			expect(callCount).toBe(1);
		}
	);
});
